import crypto from "node:crypto";
import { config, isConfiguredValue } from "./config.js";

const ALIPAY_CHARSET = "UTF-8";
const ALIPAY_VERSION = "1.0";
const ALIPAY_SIGN_TYPE = "RSA2";

const wrapPemBody = (value, type) => {
  const text = `${value ?? ""}`.trim();
  if (!text) return "";
  if (text.includes("-----BEGIN")) return text;

  const normalized = text.replace(/\s+/g, "");
  const lines = normalized.match(/.{1,64}/g)?.join("\n") ?? normalized;
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----`;
};

const getPrivateKeyPem = () => wrapPemBody(config.alipay.privateKeyPem, "PRIVATE KEY");
const getPublicKeyPem = () => wrapPemBody(config.alipay.publicKeyPem, "PUBLIC KEY");

const formatAlipayTimestamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
  ].join("");
};

const normalizeParamValue = (value) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return normalizeParamValue(value[0]);
  if (typeof value === "object") return JSON.stringify(value);
  return `${value}`;
};

export const isAlipayConfigured = () =>
  isConfiguredValue(config.alipay.appId) &&
  isConfiguredValue(config.alipay.privateKeyPem) &&
  isConfiguredValue(config.alipay.publicKeyPem) &&
  isConfiguredValue(config.alipay.gateway);

export const buildAlipaySignContent = (params = {}, { excludeSignType = true } = {}) =>
  Object.entries(params)
    .filter(
      ([key, value]) =>
        key !== "sign" &&
        (!excludeSignType || key !== "sign_type") &&
        value !== undefined &&
        value !== null &&
        `${value}` !== "",
    )
    .map(([key, value]) => [key, normalizeParamValue(value)])
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

export const signAlipayParams = (params = {}) => {
  const privateKey = getPrivateKeyPem();
  if (!privateKey) {
    throw Object.assign(new Error("支付宝应用私钥未配置"), { statusCode: 500 });
  }

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(buildAlipaySignContent(params), "utf8");
  signer.end();
  return signer.sign(privateKey, "base64");
};

export const verifyAlipayNotify = (params = {}) => {
  const publicKey = getPublicKeyPem();
  const signature = normalizeParamValue(params.sign);
  if (!publicKey || !signature) return false;

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(buildAlipaySignContent(params), "utf8");
  verifier.end();

  try {
    return verifier.verify(publicKey, signature, "base64");
  } catch {
    return false;
  }
};

const escapeHtmlAttribute = (value) =>
  `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const buildGatewayActionUrl = () => {
  const gateway = `${config.alipay.gateway ?? ""}`.trim();
  if (!gateway || /[?&]charset=/i.test(gateway)) return gateway;
  return `${gateway}${gateway.includes("?") ? "&" : "?"}charset=${encodeURIComponent(ALIPAY_CHARSET)}`;
};

export const buildAlipayPayForm = ({
  orderNo,
  subject,
  totalAmount,
  notifyUrl,
  returnUrl,
  quitUrl,
  scene = "wap",
}) => {
  if (!isAlipayConfigured()) {
    throw Object.assign(new Error("支付宝收款未配置完整，请先配置 APP_ID、应用私钥、支付宝公钥和网关"), { statusCode: 500 });
  }

  const method = scene === "page" ? "alipay.trade.page.pay" : "alipay.trade.wap.pay";
  const productCode = scene === "page" ? "FAST_INSTANT_TRADE_PAY" : "QUICK_WAP_WAY";
  const bizContent = {
    out_trade_no: orderNo,
    total_amount: Number(totalAmount).toFixed(2),
    subject: `${subject || "得宝订单"}`.slice(0, 256),
    product_code: productCode,
  };
  if (scene !== "page" && quitUrl) bizContent.quit_url = quitUrl;

  const unsignedParams = {
    app_id: config.alipay.appId,
    method,
    format: "JSON",
    charset: ALIPAY_CHARSET,
    sign_type: ALIPAY_SIGN_TYPE,
    timestamp: formatAlipayTimestamp(),
    version: ALIPAY_VERSION,
    notify_url: notifyUrl,
    return_url: returnUrl,
    biz_content: JSON.stringify(bizContent),
  };
  const params = {
    ...unsignedParams,
    sign: signAlipayParams(unsignedParams),
  };

  const inputs = Object.entries(params)
    .filter(([key]) => key !== "charset")
    .map(([key, value]) => `<input type="hidden" name="${escapeHtmlAttribute(key)}" value="${escapeHtmlAttribute(value)}" />`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>支付宝支付</title></head><body><form id="alipay-submit-form" method="post" accept-charset="${escapeHtmlAttribute(ALIPAY_CHARSET)}" action="${escapeHtmlAttribute(buildGatewayActionUrl())}">${inputs}<noscript><button type="submit">继续支付</button></noscript></form><script>document.getElementById("alipay-submit-form").submit();</script></body></html>`;
};

export const getAlipayNotifyStatus = (params = {}) => {
  const status = normalizeParamValue(params.trade_status);
  return status === "TRADE_SUCCESS" || status === "TRADE_FINISHED";
};

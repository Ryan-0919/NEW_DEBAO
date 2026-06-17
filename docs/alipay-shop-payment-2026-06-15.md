# 支付宝收款与课程商城接入记录

日期：2026-06-15

## 已完成

- 用户端新增课程商城：
  - `/shop`：展示后台上架的课程商品。
  - `/shop/orders/:orderId`：订单确认与支付页。
- 课程页新增「购买课程」入口。
- 后端新增商城接口：
  - `/api/shop/config`
  - `/api/shop/products`
  - `/api/shop/orders`
  - `/api/shop/orders/:orderId/pay`
  - `/api/shop/orders/:orderId/mock-pay`
- 后端新增支付宝异步通知：
  - `/api/shop/payments/alipay/notify`
- 后台新增「商城与支付」：
  - 商品管理：创建/编辑/删除课程商品，绑定课程权限。
  - 订单记录：查看最近订单。
  - 支付配置：开启/关闭支付宝支付、支付说明、客服链接。
- 支付成功后自动发放课程权限：
  - 写入 `UserCoursePermission`
  - 写入 `ShopDigitalFulfillment`
  - 支持幂等，重复回调不会重复发放。

## 本地测试

`.env` 保持：

```env
SHOP_PAYMENT_MODE="mock"
```

本地订单页会显示「本地模拟支付」按钮，点击后会直接把订单置为已支付，并发放课程权限。

## 正式支付宝配置

服务器 `.env` 需要补齐：

```env
SHOP_PAYMENT_MODE="alipay"
PAY_SITE_BASE_URL="https://denlaw.cn"
PAY_NOTIFY_BASE_URL="https://denlaw.cn"

ALIPAY_APP_ID=""
ALIPAY_PRIVATE_KEY=""
ALIPAY_PUBLIC_KEY=""
ALIPAY_GATEWAY="https://openapi.alipay.com/gateway.do"
```

如使用文件路径方式：

```env
ALIPAY_PRIVATE_KEY_PATH="/srv/NEW_DEBAO/secrets/alipay_app_private_key.pem"
ALIPAY_PUBLIC_KEY_PATH="/srv/NEW_DEBAO/secrets/alipay_public_key.pem"
```

支付宝后台回调地址：

```text
https://denlaw.cn/api/shop/payments/alipay/notify
```

## 注意

- `return_url` 只负责用户支付后返回页面；真正发放课程权限只认支付宝 `notify_url`。
- 正式环境不会显示「本地模拟支付」按钮。
- 后台「支付配置」只管理业务开关和说明，支付宝密钥仍然放服务器 `.env`。
- 当前商品类型优先服务「课程商品」：支付成功后自动开通商品绑定的课程。


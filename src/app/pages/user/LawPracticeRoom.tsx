import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Scale, Send, XCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { lawPracticeService, type LawPracticeQuestionForRecord, type LawPracticeRecord } from "../../services/lawPracticeService";
import { DebaoLawSearchPage } from "./DebaoLawSearchPage";

const roomStyles = `
.law-practice-room{position:fixed;inset:0;z-index:80;background:#ddebf6;color:#111;font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif;overflow:hidden}
.law-practice-room *{box-sizing:border-box}
.law-practice-header{height:100px;overflow:hidden;background:linear-gradient(180deg,#258cc7 0%,#126fa8 52%,#0b5f98 100%);color:#fff;position:relative;box-shadow:0 2px 6px rgba(0,0,0,.25)}
.law-practice-candidate{position:absolute;left:16px;top:12px;display:flex;align-items:center;gap:12px;font-size:13px;line-height:21px;text-align:left}
.law-practice-avatar{width:45px;height:60px;background:#d8e8f6;border:1px solid rgba(255,255,255,.7)}
.law-practice-title{position:absolute;left:330px;right:330px;top:20px;text-align:center;font-size:16px;font-weight:700;line-height:26px}
.law-practice-title strong{display:block;color:#fbce7f;font-size:15px}
.law-practice-actions{position:absolute;right:18px;top:31px;display:flex;align-items:center;gap:10px}
.law-practice-progress{color:#ff0;font-size:15px;font-weight:700}
.law-practice-action{height:31px;min-width:86px;border:1px solid #c60;background:linear-gradient(#fff3d8,#e7a84a);color:#000;font-size:13px;font-weight:700;cursor:pointer}
.law-practice-action:disabled{cursor:not-allowed;opacity:.6}
.law-practice-body{position:absolute;left:0;right:0;top:100px;bottom:38px;display:grid;grid-template-columns:minmax(520px,48%) minmax(520px,52%);border-top:1px solid #8db4dc}
.law-practice-law{min-width:0;height:100%;border-right:1px solid #7fa8d6;background:#fff;overflow:hidden}
.law-practice-work{position:relative;min-width:0;height:100%;overflow:hidden;background:#ddebf6}
.law-practice-scroll{position:absolute;inset:0;overflow:auto;padding:10px}
.law-practice-paper-title{height:32px;line-height:32px;text-align:center;font-size:15px;color:#333}
.law-practice-theme{float:left;font-size:13px;color:#2579b7;text-decoration:none;cursor:default}
.law-practice-question-title{font-family:"SimSun","Songti SC",serif;font-size:19px;font-weight:700;line-height:28px;padding:0 10px 0 0;color:#333}
.law-practice-stem{height:230px;overflow:auto;background:#fff;border-top:1px solid #9fb7f7;padding:20px 18px 18px;font-family:"SimSun","Songti SC",serif;font-size:18px;line-height:1.65}
.law-practice-answer{margin-top:0;background:#fff;border-top:6px solid #a1b5fa}
.law-practice-tabs{height:40px;display:flex;align-items:flex-start;gap:6px;overflow-x:auto;background:#fff}
.law-practice-tab{height:29px;min-width:60px;border:0;background:#f5f5f5;color:#000;font-size:12px;font-weight:700;cursor:pointer}
.law-practice-tab.active{background:#fb0}
.law-practice-tab.done::after{content:"";display:inline-block;width:5px;height:5px;margin-left:4px;border-radius:50%;background:#14884b;vertical-align:middle}
.law-practice-answer-body{padding:12px 15px 16px}
.law-practice-prompt{font-family:"SimSun","Songti SC",serif;font-size:17px;line-height:1.6;color:#111}
.law-practice-form-row{display:grid;grid-template-columns:150px 1fr;gap:12px;margin-top:12px;align-items:center}
.law-practice-label{font-size:14px;font-weight:700;color:#333}
.law-practice-input{height:34px;border:1px solid #999;background:#fff;padding:0 10px;font-size:15px;outline:none}
.law-practice-textarea{width:100%;height:260px;margin-top:10px;border:1px solid #999;background:#fff;padding:10px 12px;font-family:"SimSun","Songti SC",serif;font-size:18px;line-height:1.65;outline:none;resize:none}
.law-practice-textarea:focus,.law-practice-input:focus{border-color:#2579b7;box-shadow:0 0 0 2px rgba(37,121,183,.18)}
.law-practice-meta{display:flex;justify-content:space-between;gap:12px;margin-top:8px;color:#777;font-size:13px}
.law-practice-result{margin-top:14px;border:1px solid #cfdced;background:#f9fbff;padding:13px 14px;font-size:14px;line-height:1.75;color:#333}
.law-practice-result h4{margin:0 0 8px;font-size:15px;color:#111}
.law-practice-result-grid{display:grid;gap:8px;margin-bottom:10px}
.law-practice-result-row{display:flex;align-items:flex-start;gap:8px}
.law-practice-result-row.ok{color:#16733f}
.law-practice-result-row.bad{color:#b42318}
.law-practice-footer{position:absolute;left:0;right:0;bottom:0;height:38px;background:#ddebf6;border-top:1px solid #9fb7f7;display:flex;align-items:center;justify-content:center;gap:18px;font-size:15px}
.law-practice-footer button{height:29px;min-width:85px;border:0;background:linear-gradient(#ffe3a5,#d59530);color:#000;font-size:13px;cursor:pointer}
.law-practice-footer button:disabled{opacity:.55;cursor:not-allowed}
.law-practice-state{position:absolute;left:0;right:0;top:100px;bottom:0;display:grid;place-items:center;background:#ddebf6;color:#333}
.law-practice-state-panel{width:min(520px,calc(100vw - 48px));border:1px solid #9fb7f7;background:#fff;padding:28px;text-align:center;box-shadow:0 12px 34px rgba(23,67,114,.18)}
.law-practice-state-panel p{margin:10px 0 0;color:#667085;font-size:14px}
.law-practice-state-panel button{margin-top:18px;height:34px;border:1px solid #c60;background:linear-gradient(#fff3d8,#e7a84a);font-weight:700;cursor:pointer}
@media (max-width:1024px){.law-practice-body{grid-template-columns:1fr}.law-practice-law{display:none}.law-practice-title{left:160px;right:160px}.law-practice-candidate{display:none}}
`;

const toHtml = (value = "") => (!value ? "" : value.includes("<") ? value : value.replace(/\n/g, "<br />"));

const getAnswer = (question?: LawPracticeQuestionForRecord | null) => ({
  articleNo: question?.answer?.articleNo ?? "",
  answerText: question?.answer?.answerText ?? "",
});

const isAnswered = (question: LawPracticeQuestionForRecord, activeQuestionId: string, draft: { articleNo: string; answerText: string }) => {
  const answer = question.id === activeQuestionId ? draft : getAnswer(question);
  return Boolean(answer.articleNo.trim() && answer.answerText.trim());
};

export function LawPracticeRoom() {
  const { recordId = "" } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<LawPracticeRecord | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [draft, setDraft] = useState({ articleNo: "", answerText: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const questions = record?.questions ?? [];
  const activeQuestion = questions[activeIndex] ?? null;
  const submitted = record?.status === "submitted";
  const answeredCount = useMemo(
    () => questions.filter((question) => isAnswered(question, activeQuestion?.id ?? "", draft)).length,
    [questions, activeQuestion?.id, draft],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const nextRecord = await lawPracticeService.getRecord(recordId);
        if (!active) return;
        setRecord(nextRecord);
        setActiveIndex(0);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "练习记录加载失败");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [recordId]);

  useEffect(() => {
    setDraft(getAnswer(activeQuestion));
  }, [record?.id, activeQuestion?.id]);

  useEffect(() => {
    if (!record || !activeQuestion || submitted) return;
    const saved = getAnswer(activeQuestion);
    if (saved.articleNo === draft.articleNo && saved.answerText === draft.answerText) return;

    const timer = window.setTimeout(() => {
      setSaving(true);
      lawPracticeService
        .saveAnswer(record.id, activeQuestion.id, draft)
        .then((answer) => {
          setRecord((current) => {
            if (!current) return current;
            return {
              ...current,
              questions: current.questions.map((question) => question.id === activeQuestion.id ? { ...question, answer } : question),
            };
          });
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : "答案自动保存失败");
        })
        .finally(() => setSaving(false));
    }, 700);

    return () => window.clearTimeout(timer);
  }, [record?.id, activeQuestion?.id, draft.articleNo, draft.answerText, submitted]);

  const persistCurrentAnswer = async () => {
    if (!record || !activeQuestion || submitted) return true;
    const saved = getAnswer(activeQuestion);
    if (saved.articleNo === draft.articleNo && saved.answerText === draft.answerText) return true;
    setSaving(true);
    try {
      const answer = await lawPracticeService.saveAnswer(record.id, activeQuestion.id, draft);
      setRecord((current) => {
        if (!current) return current;
        return {
          ...current,
          questions: current.questions.map((question) => question.id === activeQuestion.id ? { ...question, answer } : question),
        };
      });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "答案保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goQuestion = async (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= questions.length || nextIndex === activeIndex) return;
    const saved = await persistCurrentAnswer();
    if (saved) setActiveIndex(nextIndex);
  };

  const submitRecord = async () => {
    if (!record || submitted) return;
    const saved = await persistCurrentAnswer();
    if (!saved) return;
    if (!window.confirm("确定提交整套法条练习吗？提交后会显示标准答案，不能继续修改。")) return;
    setSubmitting(true);
    try {
      const nextRecord = await lawPracticeService.submitRecord(record.id);
      setRecord(nextRecord);
      setActiveIndex(0);
      toast.success("练习已提交，可以查看标准答案");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="law-practice-room">
        <style>{roomStyles}</style>
        <div className="law-practice-state">
          <div className="law-practice-state-panel">
            <Loader2 className="mx-auto size-8 animate-spin text-[#126fa8]" />
            <p>正在进入法条练习...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!record || !activeQuestion) {
    return (
      <div className="law-practice-room">
        <style>{roomStyles}</style>
        <div className="law-practice-state">
          <div className="law-practice-state-panel">
            <h2>练习记录不存在</h2>
            <p>可能已被删除，或当前账号没有访问权限。</p>
            <button type="button" onClick={() => navigate("/user/law-practice")}>返回法条练习</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="law-practice-room">
      <style>{roomStyles}</style>
      <div className="law-practice-header">
        <div className="law-practice-candidate">
          <div className="law-practice-avatar" />
          <div>
            姓&nbsp;名：得宝学员<br />
            练习类型：法条定位<br />
            试卷编码：{record.paper.code}
          </div>
        </div>
        <div className="law-practice-title">
          国家统一法律职业资格考试计算机化考试模拟答题系统
          <strong>{record.paper.title}</strong>
        </div>
        <div className="law-practice-actions">
          <span className="law-practice-progress">进度：{answeredCount}/{questions.length}</span>
          <button type="button" className="law-practice-action" onClick={() => navigate("/user/law-practice")}>返回列表</button>
          {submitted ? (
            <button type="button" className="law-practice-action" onClick={() => navigate("/user/law-practice")}>查看完成</button>
          ) : (
            <button type="button" className="law-practice-action" disabled={submitting} onClick={() => void submitRecord()}>
              {submitting ? "提交中" : "提交练习"}
            </button>
          )}
        </div>
      </div>

      <div className="law-practice-body">
        <div className="law-practice-law">
          <DebaoLawSearchPage setPage={() => navigate("/user/law-practice")} embedded />
        </div>

        <div className="law-practice-work">
          <div className="law-practice-scroll">
            <div className="law-practice-paper-title">
              <span className="law-practice-theme">切换风格</span>
              <Scale size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              法条定位练习
            </div>

            <div className="law-practice-question-title">
              一、{activeQuestion.lawName || "法律法规汇编"}。（第 {activeIndex + 1} 题）
            </div>

            <div className="law-practice-stem">
              <div dangerouslySetInnerHTML={{ __html: toHtml(activeQuestion.prompt) }} />
            </div>

            <div className="law-practice-answer">
              <div className="law-practice-tabs">
                {questions.map((question, index) => (
                  <button
                    key={question.id}
                    type="button"
                    className={`law-practice-tab${index === activeIndex ? " active" : ""}${isAnswered(question, activeQuestion.id, draft) ? " done" : ""}`}
                    onClick={() => void goQuestion(index)}
                  >
                    题目({index + 1})
                  </button>
                ))}
              </div>

              <div className="law-practice-answer-body">
                <div className="law-practice-prompt">
                  请在左侧法律法规汇编中定位条文，填写条文序号，并将条文原文抄录到下方答题区。
                </div>

                <div className="law-practice-form-row">
                  <label className="law-practice-label" htmlFor="law-practice-article-no">条文序号</label>
                  <input
                    id="law-practice-article-no"
                    className="law-practice-input"
                    value={draft.articleNo}
                    readOnly={submitted}
                    onChange={(event) => setDraft((current) => ({ ...current, articleNo: event.target.value }))}
                    placeholder="如：第五条"
                  />
                </div>

                <textarea
                  className="law-practice-textarea"
                  value={draft.answerText}
                  readOnly={submitted}
                  onChange={(event) => setDraft((current) => ({ ...current, answerText: event.target.value }))}
                  placeholder="请抄录条文原文..."
                />

                <div className="law-practice-meta">
                  <span>已输入字数为：{draft.answerText.length}</span>
                  <span>{saving ? "正在自动保存..." : submitted ? "已提交" : "答案会自动保存"}</span>
                </div>

                {submitted && activeQuestion.standardAnswer ? (
                  <div className="law-practice-result">
                    <h4>标准答案</h4>
                    <div className="law-practice-result-grid">
                      <div className={`law-practice-result-row ${activeQuestion.result?.articleNoMatched ? "ok" : "bad"}`}>
                        {activeQuestion.result?.articleNoMatched ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                        <span>条文序号：{activeQuestion.standardAnswer.articleNo}</span>
                      </div>
                      <div className={`law-practice-result-row ${activeQuestion.result?.textMatched ? "ok" : "bad"}`}>
                        {activeQuestion.result?.textMatched ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                        <span>原文核对：{activeQuestion.result?.textMatched ? "基本一致" : "请对照标准条文修正记忆"}</span>
                      </div>
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: toHtml(activeQuestion.standardAnswer.standardText) }} />
                    {activeQuestion.standardAnswer.explanation ? (
                      <>
                        <h4 style={{ marginTop: 12 }}>解析说明</h4>
                        <div dangerouslySetInnerHTML={{ __html: toHtml(activeQuestion.standardAnswer.explanation) }} />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="law-practice-footer">
        <button type="button" onClick={() => void goQuestion(activeIndex - 1)} disabled={activeIndex <= 0}>上一题</button>
        <span>第 {activeIndex + 1} 题 / 共 {questions.length} 题</span>
        <button type="button" onClick={() => void goQuestion(activeIndex + 1)} disabled={activeIndex >= questions.length - 1}>下一题</button>
        <button type="button" disabled={submitting || submitted} onClick={() => void submitRecord()}>
          {submitted ? "已提交" : "交卷"}
        </button>
        {submitted ? <span><Send size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />已显示标准答案</span> : null}
      </div>
    </div>
  );
}

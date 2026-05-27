import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router";
import { UserLayout } from "../../layouts/UserLayout";
import { MockExamLaunch } from "./MockExamLaunch";
import { MockExamRoom } from "./MockExamRoom";
import { UserMockExamLeaderboard } from "./UserMockExamLeaderboard";

function LegacyMockExamLaunchRedirect() {
  const { paperId = "" } = useParams();
  return <Navigate to={`/user/mock-exams/papers/${paperId}`} replace />;
}

function LegacyMockExamResultRedirect() {
  const { recordId = "" } = useParams();
  return <Navigate to={`/user/my-exams/records/${recordId}/result`} replace />;
}

function LegacyMockExamReviewPendingRedirect() {
  const { recordId = "" } = useParams();
  return <Navigate to={`/user/my-exams/records/${recordId}/review-pending`} replace />;
}

function ExitLegacyRouter() {
  useEffect(() => {
    window.location.replace("/");
  }, []);

  return null;
}

function ExitToDebaoPage({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return null;
}

export function LegacyMockExamRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/user" element={<UserLayout />}>
          <Route path="mock-exams" element={<ExitToDebaoPage to="/user/mock-exams" />} />
          <Route path="objective-mock-exams" element={<ExitToDebaoPage to="/user/objective-mock-exams" />} />
          <Route path="my-exams" element={<ExitToDebaoPage to="/user/my-exams" />} />
          <Route path="exam-leaderboard" element={<UserMockExamLeaderboard />} />
          <Route path="mock-exams/papers/:paperId" element={<MockExamLaunch />} />
          <Route path="mock-exams/papers/:paperId/launch" element={<LegacyMockExamLaunchRedirect />} />
          <Route path="mock-exams/records/:recordId/review-pending" element={<LegacyMockExamReviewPendingRedirect />} />
          <Route path="mock-exams/records/:recordId/result" element={<LegacyMockExamResultRedirect />} />
          <Route path="mock-exams/records/:recordId" element={<MockExamRoom />} />
        </Route>
        <Route path="/mock-exams" element={<Navigate to="/user/objective-mock-exams" replace />} />
        <Route path="/grading/*" element={<Navigate to="/user/mock-exams" replace />} />
        <Route path="/login" element={<ExitLegacyRouter />} />
        <Route path="*" element={<Navigate to="/user/mock-exams" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

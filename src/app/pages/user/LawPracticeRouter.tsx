import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Toaster } from "../../components/ui/sonner";
import { LawPracticeHome } from "./LawPracticeHome";
import { LawPracticeRoom } from "./LawPracticeRoom";

export function LawPracticeRouter() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-center" />
      <Routes>
        <Route path="/user/law-practice" element={<LawPracticeHome />} />
        <Route path="/user/law-practice/records/:recordId" element={<LawPracticeRoom />} />
        <Route path="*" element={<Navigate to="/user/law-practice" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

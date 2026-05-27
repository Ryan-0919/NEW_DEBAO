import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useEffect } from "react";
import { Toaster } from "../../components/ui/sonner";
import { TypingPracticeGame } from "./TypingPracticeGame";
import { TypingPracticeHome } from "./TypingPracticeHome";
import { TypingPracticeResult } from "./TypingPracticeResult";

function ExitToDebaoHome() {
  useEffect(() => {
    window.location.replace("/");
  }, []);

  return null;
}

export function TypingPracticeRouter() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-center" />
      <Routes>
        <Route path="/user/typing-practice" element={<TypingPracticeHome />} />
        <Route path="/user/typing-practice/texts/:textId/play" element={<TypingPracticeGame />} />
        <Route path="/user/typing-practice/records/:recordId" element={<TypingPracticeResult />} />
        <Route path="/user/courses" element={<ExitToDebaoHome />} />
        <Route path="*" element={<Navigate to="/user/typing-practice" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

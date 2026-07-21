import test from "node:test";
import assert from "node:assert/strict";

import {
  getQuestionBankItemAudioPayload,
  hasQuestionBankItemAudioChanged,
  syncReferencedMockExamQuestionAudio,
} from "../server/lib/question-bank-audio-sync.js";

test("detects question bank lesson audio changes", () => {
  const before = {
    lessonAudioUrl: "https://old.example/audio.mp3",
    lessonAudioObjectKey: "old/audio.mp3",
    lessonAudioDurationSeconds: 120,
  };
  const after = {
    lessonAudioUrl: "https://new.example/audio.mp3",
    lessonAudioObjectKey: "new/audio.mp3",
    lessonAudioDurationSeconds: 180,
  };

  assert.equal(hasQuestionBankItemAudioChanged(before, after), true);
});

test("syncs changed question bank audio to referenced subjective mock exam questions", async () => {
  const updateCalls = [];
  const db = {
    mockExamQuestion: {
      updateMany: async (args) => {
        updateCalls.push(args);
        return { count: 2 };
      },
    },
  };

  const result = await syncReferencedMockExamQuestionAudio(db, {
    beforeItem: {
      id: "bank_item_1",
      lessonAudioUrl: "https://old.example/audio.mp3",
      lessonAudioObjectKey: "old/audio.mp3",
      lessonAudioDurationSeconds: 120,
    },
    sourceItem: {
      id: "bank_item_1",
      lessonAudioUrl: "https://new.example/audio.mp3",
      lessonAudioObjectKey: "new/audio.mp3",
      lessonAudioDurationSeconds: 180,
    },
    paperType: "subjective",
  });

  assert.equal(result.count, 2);
  assert.deepEqual(updateCalls, [
    {
      where: {
        sourceBankItemId: "bank_item_1",
        isActive: true,
        type: "subjective_case",
      },
      data: {
        lessonAudioUrl: "https://new.example/audio.mp3",
        lessonAudioObjectKey: "new/audio.mp3",
        lessonAudioDurationSeconds: 180,
      },
    },
  ]);
});

test("does not touch referenced mock exam questions when lesson audio is unchanged", async () => {
  let updateCalled = false;
  const db = {
    mockExamQuestion: {
      updateMany: async () => {
        updateCalled = true;
        return { count: 1 };
      },
    },
  };
  const item = {
    id: "bank_item_1",
    lessonAudioUrl: "https://same.example/audio.mp3",
    lessonAudioObjectKey: "same/audio.mp3",
    lessonAudioDurationSeconds: 120,
  };

  const result = await syncReferencedMockExamQuestionAudio(db, {
    beforeItem: item,
    sourceItem: { ...item, stem: "updated stem" },
    paperType: "subjective",
  });

  assert.equal(updateCalled, false);
  assert.deepEqual(result, { count: 0, skipped: true, reason: "audio_unchanged" });
});

test("normalizes cleared audio fields when building sync payload", () => {
  assert.deepEqual(
    getQuestionBankItemAudioPayload({
      lessonAudioUrl: "",
      lessonAudioObjectKey: "",
      lessonAudioDurationSeconds: "",
    }),
    {
      lessonAudioUrl: null,
      lessonAudioObjectKey: null,
      lessonAudioDurationSeconds: 0,
    },
  );
});

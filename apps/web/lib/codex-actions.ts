export type CodexChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type MoodleUIAction =
  | {
      type: "open_course";
      courseId: string;
      reason?: string;
    }
  | {
      type: "open_material";
      materialId: string;
      courseId?: string | null;
      reason?: string;
    }
  | {
      type: "open_moodle_course_page";
      courseId: string;
      reason?: string;
    };

export type CodexRunResult = {
  threadId: null;
  finalResponse: string;
  actions: MoodleUIAction[];
};

export type CodexStreamEvent =
  | {
      type: "thread";
      threadId: string | null;
    }
  | {
      type: "message";
      text: string;
    }
  | {
      type: "tool";
      title: string;
      status: "running" | "completed" | "failed";
    }
  | {
      type: "done";
      threadId: null;
      finalResponse: string;
      actions: MoodleUIAction[];
    }
  | {
      type: "error";
      error: string;
    };

export const codexOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "actions"],
  properties: {
    answer: {
      type: "string",
      description: "The user-facing answer to show in the Codex chat.",
    },
    actions: {
      type: "array",
      description: "Optional Moodle dashboard UI actions to perform after the answer.",
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "courseId"],
            properties: {
              type: { const: "open_course" },
              courseId: { type: "string" },
              reason: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "materialId"],
            properties: {
              type: { const: "open_material" },
              materialId: { type: "string" },
              courseId: { type: ["string", "null"] },
              reason: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "courseId"],
            properties: {
              type: { const: "open_moodle_course_page" },
              courseId: { type: "string" },
              reason: { type: "string" },
            },
          },
        ],
      },
    },
  },
} as const;

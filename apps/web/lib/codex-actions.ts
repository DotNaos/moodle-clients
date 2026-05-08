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
      type: "open_resource";
      courseId: string;
      resourceId: string;
      reason?: string;
    }
  | {
      type: "load_course_resources";
      courseId: string;
      reason?: string;
    }
  | {
      type: "open_moodle_course_page";
      courseId: string;
      reason?: string;
    }
  | {
      type: "open_latest_pdf";
      courseId: string;
      reason?: string;
    }
  | {
      type: "scroll_pdf_to_page";
      page: number;
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
        type: "object",
        additionalProperties: false,
        required: ["type", "courseId", "materialId", "resourceId", "page", "reason"],
        properties: {
          type: {
            type: "string",
            enum: [
              "open_course",
              "open_material",
              "open_resource",
              "load_course_resources",
              "open_moodle_course_page",
              "open_latest_pdf",
              "scroll_pdf_to_page",
            ],
          },
          courseId: {
            type: ["string", "null"],
            description: "Required for course actions; optional context for material actions.",
          },
          materialId: {
            type: ["string", "null"],
            description: "Required only when type is open_material.",
          },
          resourceId: {
            type: ["string", "null"],
            description: "Required only when type is open_resource.",
          },
          page: {
            type: ["number", "null"],
            description: "Required only when type is scroll_pdf_to_page.",
          },
          reason: {
            type: ["string", "null"],
          },
        },
      },
    },
  },
} as const;

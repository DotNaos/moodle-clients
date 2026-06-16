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
      type: "read_material_text";
      courseId: string;
      resourceId: string;
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
    }
  | {
      type: "set_task_status";
      taskId: string;
      status: "done" | "open";
      reason?: string;
    };

export type CodexRunResult = {
  threadId: string | null;
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
      type: "delta";
      text: string;
    }
  | {
      type: "tool";
      id?: string;
      title: string;
      status: "running" | "completed" | "failed";
    }
  | {
      type: "status";
      title: string;
    }
  | {
      type: "done";
      threadId: string | null;
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
      description:
        "Optional Moodle dashboard UI actions to perform after the answer.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "courseId",
          "materialId",
          "resourceId",
          "page",
          "taskId",
          "status",
          "reason",
        ],
        properties: {
          type: {
            type: "string",
            enum: [
              "open_course",
              "open_material",
              "open_resource",
              "load_course_resources",
              "read_material_text",
              "open_moodle_course_page",
              "open_latest_pdf",
              "scroll_pdf_to_page",
              "set_task_status",
            ],
          },
          courseId: {
            type: ["string", "null"],
            description:
              "Required for course actions; optional context for material actions.",
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
          taskId: {
            type: ["string", "null"],
            description:
              "Required only when type is set_task_status; the study task id from context.",
          },
          status: {
            type: ["string", "null"],
            description:
              "Required only when type is set_task_status; either done or open.",
          },
          reason: {
            type: ["string", "null"],
          },
        },
      },
    },
  },
} as const;

import type { CodexChatMessage } from "@/lib/codex-actions";
import { generatedUIPromptBlock } from "@/lib/generated-ui";

type MoodlePromptOptions = {
  allowGeneratedUI?: boolean;
  responseMode?: "structured" | "plain";
};

export function withMoodlePrompt(
  prompt: string,
  moodleContext: unknown,
  messages: CodexChatMessage[] = [],
  options: MoodlePromptOptions = {},
): string {
  const responseMode = options.responseMode ?? "structured";
  return `You are Codex inside the signed-in Moodle web dashboard.
${tutorModeBlock(moodleContext)}

Authentication invariant:
- This integration must use the host's ChatGPT/Codex subscription authentication.
- Never ask for, mention, or rely on OpenAI API keys, Codex API keys, or Moodle API keys.

Moodle rules:
- Answer from the Moodle context below and from any images or files the user attached to this message.
- Do not browse the web or use external data beyond the Moodle context and the user's attachments.
- If neither the Moodle context nor an attachment covers the question but the relevant course material is listed, request read_material_text for that exact material instead of saying you cannot read it.
- Never reveal raw Moodle URLs, tokens, sessions, cookies, or secret identifiers.
- Cite course and material names when they support the answer.
- When a course or material object has a citation field, cite it by copying that exact Markdown link. Do not invent citations or IDs.

Attachments:
- The user may attach images directly to their message. Attached images are visible to you — look at them and describe or analyze their content directly. Never claim you cannot see an attached image.
- Uploaded files live under ./uploads/ in your workspace and can be referenced by name.

UI control:
- You may ask the Moodle dashboard to open a course, open a material in the main preview, or open the Moodle course page.
- The host always asks the user for confirmation inside the chat before it applies any UI action. You should still explain the action in your answer, but do not ask for a second manual confirmation in prose.
- The course list is always available in context.
- If the user asks for a resource/PDF in a course and that course's resources are not present in context yet, use load_course_resources with the course ID. The host will load those resources and call you again with the resource list.
- If the user asks what a listed PDF/material says, or asks for a summary, explanation, search, or answer grounded in that file, use read_material_text with the exact course ID and resource ID. The host will download/cache/extract it after user confirmation and call you again with loadedMaterialTexts.
- After resources are present, use open_resource with the exact course ID and resource ID to open a file in the main preview.
- You may use multiple UI-action rounds. If one action only loads context, continue the original request in the next round instead of treating the first action as the final result.
- Do not stop after only opening a course when the user asked for a PDF/resource.
- If the user asks to open/show the newest/latest PDF in a course and you do not have resources yet, use load_course_resources first. If resources are present, choose the latest matching PDF and use open_resource.
- You may ask the Moodle dashboard to scroll the currently open PDF to a page with scroll_pdf_to_page.
- Prefer opening items inside the dashboard when the user asks to show, open, switch to, or navigate to Moodle content.
- Use exact IDs from the Moodle context when requesting UI actions.
- Keep actions minimal. Do not request an action unless it directly helps the user.
- If PDF context is present, use the extracted page text and attached page screenshots as the source for explaining the PDF.

Response shape:
${responseShapeBlock(responseMode, options.allowGeneratedUI === true)}
${generatedUIResponseBlock(options.allowGeneratedUI === true)}

Recent chat:
${formatMessages(messages)}

Moodle context:
${formatMoodleContext(moodleContext)}

User question:
${prompt}`;
}

function responseShapeBlock(
  mode: MoodlePromptOptions["responseMode"],
  allowGeneratedUI: boolean,
): string {
  if (mode === "plain") {
    const jsonRule = allowGeneratedUI
      ? "- If no dashboard action is needed, do not output JSON, XML, code fences containing actions, or any structured envelope except for the optional fenced ```json-render block described below."
      : "- If no dashboard action is needed, do not output JSON, XML, code fences containing actions, or any structured envelope.";
    return `- Reply with the normal user-facing Markdown answer first.
${jsonRule}
- If a dashboard action is needed, write the normal user-facing Markdown answer first, then append exactly one final action block in this format: <moodle-actions>{"answer":"same user-facing answer","actions":[...]}</moodle-actions>
- The chat UI hides the moodle-actions block while streaming and uses it only to ask the user for confirmation.
- Never put the moodle-actions block in a code fence. Do not mention the hidden block to the user.
- If both a json-render block and a moodle-actions block are needed, put the json-render block before the final moodle-actions block.
- Prefer short prose paragraphs. Use headings when they help, but avoid turning the whole answer into bullet points.
- Use at most one short list by default, with no more than 3 items, unless the user explicitly asks for a checklist, plan, or exhaustive list.
- Do not prefix every line with "-" or combine ordered and unordered markers like "1. - Text".`;
  }

  return `- Return a concise answer plus optional UI actions.
- The host will convert your structured response into chat text and dashboard actions.
- Prefer short prose paragraphs in the answer text. Use headings when they help, but avoid turning the whole answer into bullet points.
- Use at most one short list by default, with no more than 3 items, unless the user explicitly asks for a checklist, plan, or exhaustive list.
- Do not prefix every line with "-" or combine ordered and unordered markers like "1. - Text".`;
}

function generatedUIResponseBlock(allowGeneratedUI: boolean): string {
  if (!allowGeneratedUI) {
    return "";
  }
  return `
${generatedUIPromptBlock()}`;
}

function tutorModeBlock(moodleContext: unknown): string {
  const study = (
    moodleContext as {
      study?: { test?: { active?: boolean } | null } | null;
    } | null
  )?.study;
  if (!study?.test?.active) {
    return "";
  }
  return `
Tutor mode (the student is taking a task in test mode right now):
- moodleContext.study.test shows exactly what the student sees: the focused subtask (stepLabel/stepPrompt), their current draft answer (answerDraft), the stored official solution (solutionMarkdown), and the last grading feedback.
- Act like a personal teacher looking over the student's shoulder. Refer to the focused subtask directly; the student says "diese Aufgabe" and means it.
- Give hints and guiding questions first. Do not reveal the full solution unless the student explicitly asks for it.
- When asked to check or compare, compare the draft answer against the official solution and point out concrete gaps.
- If the conversation convinces you the student has mastered this task, you may propose marking it done with a set_task_status action using study.test.taskId and status "done". The host asks the student for confirmation first, so propose it deliberately and mention it in your answer.
`;
}

function formatMessages(messages: CodexChatMessage[]): string {
  const recent = messages
    .filter((message) => message.text.trim())
    .slice(-10)
    .map((message) => `${message.role}: ${message.text.trim()}`);

  return recent.length > 0 ? recent.join("\n") : "No previous messages.";
}

function formatMoodleContext(context: unknown): string {
  if (!context || typeof context !== "object") {
    return "No Moodle context is currently loaded.";
  }

  return JSON.stringify(context, null, 2).slice(0, 120000);
}

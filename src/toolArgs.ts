// Arg-coercion helpers that absorb the parameter-name variants gemma-4-12b-qat actually emits, so a
// name slip (`path`/`name` instead of `file_name`, `data` instead of `content`) doesn't hard-fail a
// main-loop tool. The same aliases are already enforced for SUB-agents in toolCallValidator.ts — this
// lifts that tolerance to the main-loop tools. NOTE: LM Studio strips args not declared in a tool's
// zod schema before the implementation runs, so each alias must ALSO be declared (optional) in the
// schema for these helpers to see it. Pure + unit-tested.

export function coerceFileName(args: Record<string, any> = {}): string | undefined {
  const v = args.file_name ?? args.fileName ?? args.path ?? args.name ?? args.filepath ?? args.file_path;
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

export function coerceFileContent(args: Record<string, any> = {}): string | undefined {
  // `??` (not `||`) so a legitimately empty string "" is preserved, not treated as missing.
  const v = args.content ?? args.data ?? args.text ?? args.body;
  return typeof v === "string" ? v : undefined;
}

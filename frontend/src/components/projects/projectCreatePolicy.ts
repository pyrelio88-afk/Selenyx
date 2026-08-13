/** The creation sheet deliberately asks for one thing: a project name. */
export function isProjectNameReady(name: string): boolean {
  return Boolean(name.trim());
}

/** A partial deadline is supplemental data, never a creation prerequisite. */
export function hasCompleteCountdown(label: string, date: string): boolean {
  return Boolean(label.trim() && date);
}

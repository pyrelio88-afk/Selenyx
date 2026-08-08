import type { ResearchProject } from '@apptypes/index';

const SBAR_MAINLINE_PATTERN = /(?:AI\s*辅助\s*)?SBAR|结构化护理交接/i;

/**
 * Select the user's persistent research mainline without relying on array
 * order. Explicit metadata always wins; the SBAR title match only migrates
 * legacy workspaces that predate ownerRole/isPrimary.
 */
export function selectPrimaryProject(projects: ResearchProject[]): ResearchProject | null {
  return projects.find((project) => project.isPrimary)
    ?? projects.find((project) => project.ownerRole === 'lead' && SBAR_MAINLINE_PATTERN.test(project.name))
    ?? projects.find((project) => SBAR_MAINLINE_PATTERN.test(project.name))
    ?? projects.find((project) => project.ownerRole === 'lead')
    ?? projects[0]
    ?? null;
}

export function projectRoleLabel(project: ResearchProject): '我主导' | '我参与' {
  return project.ownerRole === 'participant' ? '我参与' : '我主导';
}

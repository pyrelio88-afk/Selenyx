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
    // Only the known legacy AI-SBAR project may be upgraded implicitly. A
    // generic lead project, and especially the first array item, is not a
    // reliable statement of the user's research mainline.
    ?? projects.find((project) => project.ownerRole !== 'participant' && SBAR_MAINLINE_PATTERN.test(project.name))
    ?? null;
}

export function projectRoleLabel(project: ResearchProject): '我主导' | '我参与' {
  return project.ownerRole === 'participant' ? '我参与' : '我主导';
}

/**
 * A stable presentation order for every project selector/list.  Persistence
 * order is an implementation detail, so it must never decide which project
 * looks like the user's mainline.  Archived work stays available but is
 * deliberately kept at the end of operational lists.
 */
export function orderProjectsForWorkspace(projects: ResearchProject[]): ResearchProject[] {
  return [...projects].sort((left, right) => {
    const leftRank = projectPresentationRank(left);
    const rightRank = projectPresentationRank(right);
    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftUpdated = Date.parse(left.updatedAt || left.createdAt || '') || 0;
    const rightUpdated = Date.parse(right.updatedAt || right.createdAt || '') || 0;
    if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

function projectPresentationRank(project: ResearchProject): number {
  if (project.status === 'archived') return 3;
  if (project.isPrimary) return 0;
  if (project.ownerRole !== 'participant') return 1;
  return 2;
}

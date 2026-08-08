import { describe, expect, it } from 'vitest';
import type { ResearchProject } from '@apptypes/index';
import { projectRoleLabel, selectPrimaryProject } from '../projectPriority';

function project(id: string, name: string, patch: Partial<ResearchProject> = {}): ResearchProject {
  return {
    id, name, description: '', currentStage: 'problem', tags: [], referenceIds: [], taskIds: [],
    status: 'active', startDate: null, endDate: null, createdAt: '', updatedAt: '', ...patch,
  };
}

describe('project mainline selection', () => {
  it('prefers explicit primary regardless of storage order', () => {
    const collaborator = project('p2', '脑卒中照顾者分阶段支持', { ownerRole: 'participant' });
    const lead = project('p1', 'AI 辅助 SBAR 结构化护理交接训练', { ownerRole: 'lead', isPrimary: true });
    expect(selectPrimaryProject([collaborator, lead])?.id).toBe('p1');
    expect(projectRoleLabel(collaborator)).toBe('我参与');
  });

  it('migrates a legacy SBAR project before falling back to the first item', () => {
    expect(selectPrimaryProject([
      project('p2', '脑卒中照顾者分阶段支持'),
      project('p1', 'SBAR 护理交接研究'),
    ])?.id).toBe('p1');
  });
});

import { describe, expect, it } from 'vitest';
import type { ResearchProject } from '@apptypes/index';
import { orderProjectsForWorkspace, projectRoleLabel, selectPrimaryProject } from '../projectPriority';

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

  it('migrates a legacy AI-SBAR project without relying on storage order', () => {
    expect(selectPrimaryProject([
      project('p2', '脑卒中照顾者分阶段支持'),
      project('p1', 'SBAR 护理交接研究'),
    ])?.id).toBe('p1');
  });

  it('leaves an unlabelled legacy workspace without a guessed mainline', () => {
    expect(selectPrimaryProject([
      project('p1', '多中心队列研究'),
      project('p2', '脑卒中照顾者分阶段支持', { ownerRole: 'participant' }),
    ])).toBeNull();
  });

  it('keeps mainline and lead projects before participants and archived work', () => {
    const ordered = orderProjectsForWorkspace([
      project('archived', '旧课题', { ownerRole: 'lead', status: 'archived' }),
      project('participant', '协作课题', { ownerRole: 'participant' }),
      project('lead', '我的课题', { ownerRole: 'lead' }),
      project('primary', '主线课题', { ownerRole: 'lead', isPrimary: true }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['primary', 'lead', 'participant', 'archived']);
  });
});

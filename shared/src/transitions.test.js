import { describe, it, expect } from 'vitest';
import { TRANSITIONS, availableActions, TOPIC_STATUS, TOPIC_STATUS_LABEL, ENABLED_ACTIONS, PRE_APPROVAL_STATUSES, isActiveStatus, findTransition } from './index.js';

describe('Bảng chuyển trạng thái', () => {
  // 14 → 20: đặc tả đổi (DAC_TA mục 9, API_GD7 §0 thêm 6 thao tác), không phải nới test
  it('có đúng 20 thao tác, mã duy nhất', () => {
    expect(TRANSITIONS).toHaveLength(20);
    expect(new Set(TRANSITIONS.map((t) => t.action)).size).toBe(20);
  });
  it('mọi trạng thái nguồn/đích đều hợp lệ', () => {
    const all = Object.values(TOPIC_STATUS);
    TRANSITIONS.forEach((t) => { expect(all).toContain(t.from); expect(all).toContain(t.to); });
  });
  it('trạng thái kết thúc không có lối ra', () => {
    ['REJECTED', 'CANCELLED', 'CLOSED'].forEach((s) => expect(TRANSITIONS.some((t) => t.from === s)).toBe(false));
  });
  it('ADMIN không có thao tác nghiệp vụ nào (FR25)', () => {
    Object.values(TOPIC_STATUS).forEach((s) => expect(availableActions(s, 'ADMIN')).toEqual([]));
  });
  it('sinh viên ở Chờ xét duyệt không tự duyệt được', () => {
    expect(availableActions('UNDER_REVIEW', 'STUDENT')).toEqual([]);
  });
  it('6 thao tác GĐ7 đúng nguồn/đích/vai trò/cờ (API_GD7 §0)', () => {
    const pick = (a) => { const t = findTransition(a); return [t.from, t.to, t.actors, !!t.currentAdvisorOnly, !!t.reasonRequired, !!t.needsSimilarity, !!t.councilOfficerOnly]; };
    expect(pick('PUBLISH_RECRUITMENT')).toEqual(['DRAFT', 'RECRUITING', ['LECTURER'], true, false, true, false]);
    expect(pick('UNPUBLISH_RECRUITMENT')).toEqual(['RECRUITING', 'DRAFT', ['LECTURER'], true, true, false, false]);
    expect(pick('FINALIZE_GROUP')).toEqual(['RECRUITING', 'HAS_ADVISOR', ['LECTURER'], true, false, false, false]);
    expect(pick('REQUEST_DEFENSE')).toEqual(['IN_PROGRESS', 'WAITING_DEFENSE', ['LECTURER'], true, false, false, false]);
    expect(pick('RETURN_FROM_DEFENSE')).toEqual(['WAITING_DEFENSE', 'IN_PROGRESS', ['STAFF'], false, true, false, false]);
    expect(pick('COUNCIL_FINALIZE')).toEqual(['WAITING_DEFENSE', 'WAITING_CLOSE', ['LECTURER'], false, false, false, true]);
  });
  it('ENABLED_ACTIONS: không bao giờ có CANCEL, COUNCIL_FINALIZE; action GĐ7 chỉ bật khi task endpoint của nó xong', () => {
    expect(ENABLED_ACTIONS).not.toContain('CANCEL');
    expect(ENABLED_ACTIONS).not.toContain('COUNCIL_FINALIZE');
    const gd7 = ['PUBLISH_RECRUITMENT', 'UNPUBLISH_RECRUITMENT', 'FINALIZE_GROUP', 'REQUEST_DEFENSE', 'RETURN_FROM_DEFENSE'];
    // DC-05 bật PUBLISH/UNPUBLISH_RECRUITMENT, DC-06 FINALIZE_GROUP, DC-07 REQUEST/RETURN_FROM_DEFENSE (có endpoint) – đủ GD7 §0
    expect(ENABLED_ACTIONS.filter((a) => gd7.includes(a))).toEqual(gd7);
    expect([...ENABLED_ACTIONS].sort()).toEqual(TRANSITIONS.map((t) => t.action).filter((a) => !['CANCEL', 'COUNCIL_FINALIZE'].includes(a)).sort());
  });
  it('2 trạng thái mới: có nhãn, là đề tài hoạt động; RECRUITING thuộc trước duyệt, WAITING_DEFENSE thì không', () => {
    expect(Object.keys(TOPIC_STATUS_LABEL).sort()).toEqual(Object.values(TOPIC_STATUS).sort());
    expect([TOPIC_STATUS_LABEL.RECRUITING, TOPIC_STATUS_LABEL.WAITING_DEFENSE]).toEqual(['Đang tuyển sinh viên', 'Chờ bảo vệ']);
    expect([isActiveStatus('RECRUITING'), isActiveStatus('WAITING_DEFENSE')]).toEqual([true, true]);
    expect(PRE_APPROVAL_STATUSES).toContain('RECRUITING');
    expect(PRE_APPROVAL_STATUSES).not.toContain('WAITING_DEFENSE');
  });
  it('sinh viên không có thao tác nào ở RECRUITING/WAITING_DEFENSE', () => {
    expect(availableActions('RECRUITING', 'STUDENT')).toEqual([]);
    expect(availableActions('WAITING_DEFENSE', 'STUDENT')).toEqual([]);
  });
});

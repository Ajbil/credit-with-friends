import type { CircleMemberDto } from '../../../api/generated';

// Filled by the member-removal task; the page already places each control.
export function CircleMemberRemoval(props: { circleId: string; member: CircleMemberDto }) {
  void props;
  return null;
}

export function CircleClearRemovals(props: { circleId: string }) {
  void props;
  return null;
}

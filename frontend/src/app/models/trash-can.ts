export interface TrashCan {
  id: string;
  userID: string;
  departmentSlug: string;
  courseSlug: string;
  room: string;
  responderName?: string;
  active: boolean;
  created?: string;
  numInLine: number;
  secondsSinceCreation?: string;
}

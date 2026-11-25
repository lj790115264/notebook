export type TaskStatus = "pending" | "done" | "archived";

export interface TaskSummary {
  id: string;
  status: TaskStatus;
  title: string;
  due: string;
  created: string;
  completed: string;
  archived: boolean;
  file: string;
}

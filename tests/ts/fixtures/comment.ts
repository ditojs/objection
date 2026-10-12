import * as objection from 'objection';

export class Comment extends objection.Model {
  id!: number;
  comment!: string;
}

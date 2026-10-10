import * as objection from 'objection';

export class Review extends objection.Model {
  id!: number;
  title?: string;
  stars!: number;
  text!: string;
}

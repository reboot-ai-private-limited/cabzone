import { v7 as uuidv7 } from 'uuid';

export function newRequestId(): string {
  return `req_${uuidv7()}`;
}

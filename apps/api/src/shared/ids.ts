import { v7 as uuidv7 } from 'uuid';

export function newUuid(): string {
  return uuidv7();
}

export function newRequestId(): string {
  return `req_${uuidv7()}`;
}

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, { success: true; data: T; error: null }> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<{ success: true; data: T; error: null }> {
    return next.handle().pipe(map((data) => ({ success: true as const, data, error: null })));
  }
}

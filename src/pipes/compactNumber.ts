import { Pipe, PipeTransform } from '@angular/core';

// Compact number formatting for view/favorite/comment counts.
// 1234 → "1k", 1_500_000 → "1.5m". Falls back to "0" for non-numeric input.
@Pipe({ name: 'compactNumber' })
export class CompactNumberPipe implements PipeTransform {
  transform(n: any): string {
    const v = Number(n);
    if (!v || isNaN(v)) return '0';
    if (v >= 1000000) return `${Math.round(v / 100000) / 10}m`;
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    return String(v);
  }
}

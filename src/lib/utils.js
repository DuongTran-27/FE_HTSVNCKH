import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Gộp class Tailwind, lớp sau thắng lớp trước (dùng bởi component shadcn/ui) */
export const cn = (...inputs) => twMerge(clsx(inputs));

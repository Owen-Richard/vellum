import { forwardRef } from 'react';
import clsx from 'clsx';
import styles from './Input.module.css';

type InputProps = {
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(styles.input, className)}
        {...rest}
      />
    );
  },
);

type TextareaProps = {
  className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={clsx(styles.textarea, className)}
        {...rest}
      />
    );
  },
);

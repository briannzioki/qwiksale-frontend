"use client";
import * as React from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  /** keep wheel prevention optional (default true) */
  preventWheel?: boolean;
};

const NumberInputNoWheel = React.forwardRef<HTMLInputElement, Props>(
  ({ preventWheel = true, onWheel, type, ...rest }, ref) => {
    const handleWheel: React.WheelEventHandler<HTMLInputElement> = (e) => {
      if (preventWheel) {
        // Prevent accidental value changes with the mouse wheel
        e.currentTarget.blur();
        setTimeout(() => e.currentTarget.focus(), 0);
        e.preventDefault();
      }
      onWheel?.(e);
    };

    return <input ref={ref} type="number" onWheel={handleWheel} {...rest} />;
  }
);
NumberInputNoWheel.displayName = "NumberInputNoWheel";

export default NumberInputNoWheel;

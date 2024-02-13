'use client';
import * as React from 'react';
import { useEventCallback } from '@mui/material/utils';
import { TouchRippleActions } from './TouchRipple.types';
import { LazyRipple } from './useLazyRipple';

interface UseTouchRippleProps {
  disabled: boolean;
  disableFocusRipple?: boolean;
  disableRipple?: boolean;
  disableTouchRipple?: boolean;
  ripple: LazyRipple;
}

interface RippleEventHandlers {
  onBlur: React.FocusEventHandler;
  onContextMenu: React.MouseEventHandler;
  onDragLeave: React.DragEventHandler;
  onMouseDown: React.MouseEventHandler;
  onMouseLeave: React.MouseEventHandler;
  onMouseUp: React.MouseEventHandler;
  onTouchEnd: React.TouchEventHandler;
  onTouchMove: React.TouchEventHandler;
  onTouchStart: React.TouchEventHandler;
}

const useTouchRipple = (props: UseTouchRippleProps) => {
  const { disabled, disableRipple, disableTouchRipple, ripple } = props;

  function useRippleHandler(
    rippleAction: keyof TouchRippleActions,
    skipRippleAction = disableTouchRipple,
  ) {
    return useEventCallback((event: React.SyntheticEvent) => {
      if (!skipRippleAction) {
        const action = ripple[rippleAction] as TouchRippleActions[typeof rippleAction];
        action(event);
      }

      return true;
    });
  }

  const handleBlur = useRippleHandler('stop', false);
  const handleMouseDown = useRippleHandler('start');
  const handleContextMenu = useRippleHandler('stop');
  const handleDragLeave = useRippleHandler('stop');
  const handleMouseUp = useRippleHandler('stop');
  const handleMouseLeave = useRippleHandler('stop');
  const handleTouchStart = useRippleHandler('start');
  const handleTouchEnd = useRippleHandler('stop');
  const handleTouchMove = useRippleHandler('stop');

  const enableTouchRipple = ripple.shouldMount && !disableRipple && !disabled;

  const getRippleHandlers = React.useMemo(() => {
    const rippleHandlers = {
      onBlur: handleBlur,
      onMouseDown: handleMouseDown,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseLeave,
      onContextMenu: handleContextMenu,
      onDragLeave: handleDragLeave,
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
      onTouchMove: handleTouchMove,
    } as RippleEventHandlers;

    return (otherEvents: Partial<RippleEventHandlers> = {}) => {
      const eventNames = Object.keys(rippleHandlers) as (keyof RippleEventHandlers)[];
      const wrappedEvents = eventNames.map((eventName) => ({
        name: eventName,
        handler: (ev: any) => {
          otherEvents[eventName]?.(ev);
          rippleHandlers[eventName](ev);
        },
      }));

      return wrappedEvents.reduce((acc, current) => {
        acc[current.name] = current.handler;
        return acc;
      }, {} as RippleEventHandlers);
    };
  }, [
    handleBlur,
    handleMouseDown,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
    handleDragLeave,
    handleTouchStart,
    handleTouchEnd,
    handleTouchMove,
  ]);

  return {
    enableTouchRipple,
    getRippleHandlers,
  };
};

export default useTouchRipple;

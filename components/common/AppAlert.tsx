import React, { useState, useEffect } from 'react';
import {
  MessagePopup,
  MessagePopupButton,
  MessagePopupType,
} from './MessagePopup';

export type AlertButton = MessagePopupButton;

export interface AlertOptions {
  type?: MessagePopupType;
  cancelable?: boolean;
  onDismiss?: () => void;
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  type: MessagePopupType;
  buttons?: AlertButton[];
  cancelable?: boolean;
  onClose?: () => void;
}

type AlertListener = (state: AlertState) => void;
let listeners: AlertListener[] = [];

function notify(state: AlertState) {
  listeners.forEach((l) => l(state));
}

// Auto-infer semantic type based on title, message, and button styles
function inferType(
  title: string,
  message?: string,
  buttons?: AlertButton[]
): MessagePopupType {
  const combined = `${title || ''} ${message || ''}`.toLowerCase();

  // Destructive buttons or keywords -> warning / destructive
  if (
    buttons?.some((b) => b.style === 'destructive') ||
    combined.includes('delete') ||
    combined.includes('remove') ||
    combined.includes('destroy') ||
    combined.includes('disable') ||
    combined.includes('discard') ||
    combined.includes('warning') ||
    combined.includes('are you sure')
  ) {
    return 'warning';
  }

  // Errors or failures
  if (
    combined.includes('error') ||
    combined.includes('failed') ||
    combined.includes('failure') ||
    combined.includes('denied') ||
    combined.includes('invalid') ||
    combined.includes('mismatch') ||
    combined.includes('unable') ||
    combined.includes('cannot') ||
    combined.includes('not found') ||
    combined.includes('missing') ||
    combined.includes('rejected')
  ) {
    return 'error';
  }

  // Successes
  if (
    combined.includes('success') ||
    combined.includes('saved') ||
    combined.includes('complete') ||
    combined.includes('verified') ||
    combined.includes('enabled') ||
    combined.includes('sent') ||
    combined.includes('refreshed') ||
    combined.includes('updated') ||
    combined.includes('connected') ||
    combined.includes('created') ||
    combined.includes('restored')
  ) {
    return 'success';
  }

  return 'info';
}

export const AppAlert = {
  alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions
  ) {
    const determinedType =
      options?.type || inferType(title, message, buttons);

    notify({
      visible: true,
      title: title || '',
      message,
      type: determinedType,
      buttons,
      cancelable: options?.cancelable ?? false,
      onClose: options?.onDismiss,
    });
  },

  success(title: string, message?: string, onConfirm?: () => void | Promise<void>) {
    AppAlert.alert(
      title,
      message,
      [{ text: 'OK', onPress: onConfirm, style: 'default' }],
      { type: 'success' }
    );
  },

  error(title: string, message?: string, onConfirm?: () => void | Promise<void>) {
    AppAlert.alert(
      title,
      message,
      [{ text: 'OK', onPress: onConfirm, style: 'default' }],
      { type: 'error' }
    );
  },

  warning(title: string, message?: string, onConfirm?: () => void | Promise<void>) {
    AppAlert.alert(
      title,
      message,
      [{ text: 'OK', onPress: onConfirm, style: 'default' }],
      { type: 'warning' }
    );
  },

  confirm(
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    onCancel?: () => void | Promise<void>,
    options?: {
      destructive?: boolean;
      confirmText?: string;
      cancelText?: string;
    }
  ) {
    AppAlert.alert(
      title,
      message,
      [
        {
          text: options?.cancelText || 'Cancel',
          style: 'cancel',
          onPress: onCancel,
        },
        {
          text: options?.confirmText || (options?.destructive ? 'Delete' : 'Confirm'),
          style: options?.destructive ? 'destructive' : 'default',
          onPress: onConfirm,
        },
      ],
      { type: options?.destructive ? 'warning' : 'info' }
    );
  },

  dismiss() {
    notify({
      visible: false,
      title: '',
      type: 'info',
    });
  },
};

export { AppAlert as Alert };

export function GlobalAlertModal() {
  const [state, setState] = useState<AlertState>({
    visible: false,
    title: '',
    type: 'info',
  });

  useEffect(() => {
    const listener: AlertListener = (newState) => {
      setState(newState);
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const handleClose = () => {
    setState((prev) => ({ ...prev, visible: false }));
    state.onClose?.();
  };

  return (
    <MessagePopup
      visible={state.visible}
      title={state.title}
      message={state.message}
      type={state.type}
      buttons={state.buttons}
      cancelable={state.cancelable}
      onClose={handleClose}
    />
  );
}

export default AppAlert;

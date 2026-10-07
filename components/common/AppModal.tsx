import React, { useEffect, useRef } from 'react';
import { Modal as RNModal, ModalProps, Platform, Keyboard } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { ModalPortal } from './ModalPortal';

export type AppModalProps = ModalProps & {
  avoidSystemControls?: boolean;
  systemControlPadding?: number;
  native?: boolean;
};

export function AppModal({
  statusBarTranslucent = true,
  navigationBarTranslucent = false,
  animationType: _animationType,
  visible,
  onShow,
  onDismiss,
  onRequestClose,
  children,
  avoidSystemControls = true,
  systemControlPadding = 20,
  native = false,
  ...props
}: AppModalProps) {
  const modalAnimationType: NonNullable<ModalProps['animationType']> = 'none';
  const modalIdRef = useRef<string | null>(null);
  if (!modalIdRef.current) {
    modalIdRef.current = `app_modal_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
  }
  const modalId = modalIdRef.current;
  const prevVisibleRef = useRef(Boolean(visible));

  const handleRequestClose = (event?: any) => {
    if (onRequestClose) {
      onRequestClose(event);
    } else if (onDismiss) {
      onDismiss();
    }
  };

  // Safe fallback for native dialog window immersive restore if native={true} is used
  const restoreImmersiveMode = () => {
    if (Platform.OS !== 'android' || !native) return () => {};

    try {
      NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    } catch {
      // Guard against synchronous native exceptions
    }

    return () => {};
  };

  // Active immersive mode enforcement on Android ONLY when native={true} OS dialog is used
  useEffect(() => {
    if (Platform.OS !== 'android' || !native) return;

    try {
      NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    } catch {
      // Guard against synchronous native exceptions
    }
  }, [visible, native]);

  // In-Tree Portal Mode (Default): renders via ModalPortalHost, zero OS Dialog window creation
  useEffect(() => {
    if (native) return;

    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = Boolean(visible);

    if (visible) {
      ModalPortal.upsertModal({
        id: modalId,
        visible: true,
        children,
        animationType: modalAnimationType,
        transparent: props.transparent,
        onRequestClose: handleRequestClose,
        onShow,
        onDismiss,
      });
    } else if (wasVisible) {
      Keyboard.dismiss();
      ModalPortal.upsertModal({
        id: modalId,
        visible: false,
        children,
        animationType: modalAnimationType,
        transparent: props.transparent,
        onRequestClose: handleRequestClose,
        onShow,
        onDismiss,
      });
    }
  }, [visible, children, modalAnimationType, props.transparent, onShow, onDismiss, native]);

  useEffect(() => {
    if (native) return;
    return () => {
      ModalPortal.removeModal(modalId);
    };
  }, [native]);

  if (native) {
    const handleNativeDismiss = () => {
      restoreImmersiveMode();
      onDismiss?.();
    };

    return (
      <RNModal
        statusBarTranslucent={statusBarTranslucent}
        navigationBarTranslucent={navigationBarTranslucent}
        visible={visible}
        onShow={onShow}
        onDismiss={handleNativeDismiss}
        onRequestClose={handleRequestClose}
        {...props}
        animationType={modalAnimationType}
      >
        {children}
      </RNModal>
    );
  }

  // In-tree modal is rendered at the root host
  return null;
}

export { AppModal as Modal };
export { AppKeyboardAvoidingView as KeyboardAvoidingView } from './AppKeyboardAvoidingView';
export default AppModal;

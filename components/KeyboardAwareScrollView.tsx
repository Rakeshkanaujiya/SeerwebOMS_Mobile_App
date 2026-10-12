import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  extraScrollHeight?: number;
  keyboardVerticalOffset?: number;
};

export default function KeyboardAwareScrollView({
  children,
  contentContainerStyle,
  extraScrollHeight = 28,
  keyboardVerticalOffset = 0,
  keyboardShouldPersistTaps = 'handled',
  onScroll,
  scrollEventThrottle = 16,
  ...props
}: KeyboardAwareScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bottomInset, setBottomInset] = useState(0);

  const stopFocusWatcher = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const scrollFocusedInputIntoView = useCallback(() => {
    const focusedInput = (TextInput.State as any)?.currentlyFocusedInput?.();

    if (!focusedInput || !scrollRef.current) return;
    const keyboardHeight = keyboardHeightRef.current;
    if (keyboardHeight <= 0) return;

    const windowHeight = Dimensions.get('window').height;
    const keyboardTop = windowHeight - keyboardHeight;

    focusedInput.measureInWindow?.((x: number, y: number, width: number, height: number) => {
      const inputBottom = y + height;
      const lowerLimit = keyboardTop - extraScrollHeight;
      const upperLimit = 12 + keyboardVerticalOffset;

      if (inputBottom > lowerLimit) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, scrollYRef.current + inputBottom - lowerLimit),
          animated: true,
        });
        return;
      }

      if (y < upperLimit) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, scrollYRef.current - (upperLimit - y)),
          animated: true,
        });
      }
    });
  }, [extraScrollHeight, keyboardVerticalOffset]);

  const scheduleScroll = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(scrollFocusedInputIntoView, 80);
  }, [scrollFocusedInputIntoView]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      keyboardHeightRef.current = event.endCoordinates?.height ?? 0;
      setBottomInset(keyboardHeightRef.current + extraScrollHeight);
      scheduleScroll();
      if (!intervalRef.current) {
        intervalRef.current = setInterval(scrollFocusedInputIntoView, 280);
      }
    });

    const changeSub = Keyboard.addListener('keyboardDidChangeFrame', (event) => {
      keyboardHeightRef.current = event.endCoordinates?.height ?? keyboardHeightRef.current;
      setBottomInset(keyboardHeightRef.current + extraScrollHeight);
      scheduleScroll();
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      setBottomInset(0);
      stopFocusWatcher();
    });

    return () => {
      showSub.remove();
      changeSub.remove();
      hideSub.remove();
      stopFocusWatcher();
    };
  }, [extraScrollHeight, scheduleScroll, scrollFocusedInputIntoView, stopFocusWatcher]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll]
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={{ flex: 1 }}>
      <ScrollView
        {...props}
        ref={scrollRef}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        onScroll={handleScroll}
        scrollEventThrottle={scrollEventThrottle}
        contentContainerStyle={[
          contentContainerStyle,
          bottomInset > 0 ? { paddingBottom: bottomInset } : null,
        ]}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

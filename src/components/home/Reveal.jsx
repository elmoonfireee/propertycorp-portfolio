import React, { useEffect, useRef, useState } from "react";

// Shared motion rhythm for the homepage's scroll-triggered reveals.
export const REVEAL_MOTION = Object.freeze({
  eyebrow: { duration: 1250 },
  heading: { delay: 190, duration: 1700 },
  copy: { delay: 410, duration: 1450 },
  action: { delay: 630, duration: 1200 },
  media: { duration: 1650 },
});

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const revealCallbacks = new Map();
let revealObserver = null;

function getRevealObserver() {
  if (revealObserver || typeof IntersectionObserver === "undefined") return revealObserver;

  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const reveals = revealCallbacks.get(entry.target);
      if (!reveals) return;
      revealCallbacks.delete(entry.target);
      revealObserver?.unobserve(entry.target);
      reveals.forEach((reveal) => reveal());
    });
  }, {
    threshold: 0.04,
    rootMargin: "0px 0px -12% 0px",
  });

  return revealObserver;
}

function observeReveal(element, onReveal) {
  const observer = getRevealObserver();
  if (!observer) {
    onReveal();
    return () => {};
  }

  const callbacks = revealCallbacks.get(element) || new Set();
  callbacks.add(onReveal);
  revealCallbacks.set(element, callbacks);
  observer.observe(element);

  return () => {
    const callbacks = revealCallbacks.get(element);
    callbacks?.delete(onReveal);
    if (!callbacks?.size) {
      revealCallbacks.delete(element);
      observer.unobserve(element);
    }
    if (!revealCallbacks.size && revealObserver === observer) {
      observer.disconnect();
      revealObserver = null;
    }
  };
}

export function Reveal({ children, className = "", delay = 0, duration, offset, as: Tag = "div", revealRef = null, triggerRef = null }) {
  const elementRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = triggerRef?.current || elementRef.current;
    if (!element || prefersReducedMotion()) {
      setVisible(true);
      return undefined;
    }

    return observeReveal(element, () => setVisible(true));
  }, [triggerRef]);

  const setElementRef = (element) => {
    elementRef.current = element;
    if (typeof revealRef === "function") revealRef(element);
    else if (revealRef) revealRef.current = element;
  };

  const style = {
    "--reveal-delay": `${delay}ms`,
    ...(duration ? { "--reveal-duration": `${duration}ms` } : {}),
    ...(offset ? { "--reveal-offset": `${offset}px` } : {}),
  };

  return (
    <Tag
      ref={setElementRef}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`.trim()}
      style={style}
    >
      {children}
    </Tag>
  );
}

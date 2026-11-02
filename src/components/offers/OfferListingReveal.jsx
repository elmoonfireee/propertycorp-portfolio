import React, { useEffect, useRef, useState } from "react";

const LISTING_REVEAL_MOTION = Object.freeze({
  duration: 1800,
  offset: 34,
  stagger: 165,
});

function getColumnCount() {
  if (typeof window === "undefined") return 3;
  if (window.innerWidth <= 700) return 1;
  if (window.innerWidth <= 1100) return 2;
  return 3;
}

/**
 * Listing-specific reveal: it starts before a card enters the viewport and
 * reuses the same left-to-right rhythm for each consecutive pair of grid rows.
 */
export function OfferListingReveal({ children, className = "", index }) {
  const elementRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [columns, setColumns] = useState(getColumnCount);

  useEffect(() => {
    const onResize = () => setColumns((current) => {
      const next = getColumnCount();
      return current === next ? current : next;
    });

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setIsVisible(true);
      observer.disconnect();
    }, {
      threshold: 0.02,
      rootMargin: "0px 0px 10% 0px",
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const style = {
    "--reveal-delay": `${(index % (columns * 2)) * LISTING_REVEAL_MOTION.stagger}ms`,
    "--reveal-duration": `${LISTING_REVEAL_MOTION.duration}ms`,
    "--reveal-offset": `${LISTING_REVEAL_MOTION.offset}px`,
    willChange: "opacity, transform",
  };

  return (
    <div ref={elementRef} className={`reveal ${isVisible ? "is-visible" : ""} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

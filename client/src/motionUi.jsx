import { animate, motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/** Shared motion primitives — landing language without Lenis / cursor glow. */
export const EASE = [0.22, 1, 0.36, 1];
export const SPRING = { type: 'spring', stiffness: 230, damping: 28, mass: 0.9 };

export function Reveal({ children, className = '', delay = 0, y = 28, ...rest }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 0.7, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

export const staggerChild = {
  hidden: { opacity: 0, y: 22, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: EASE } },
};

export function FadeIn({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedNumber({ to, format, duration = 1.4, className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-6% 0px' });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView || to == null || !Number.isFinite(Number(to))) return undefined;
    const controls = animate(0, Number(to), {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, to, duration]);
  return <span ref={ref} className={className}>{to == null ? '—' : format(val)}</span>;
}

export { motion, AnimatePresence } from 'motion/react';

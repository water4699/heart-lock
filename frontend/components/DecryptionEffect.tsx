"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Lock, Unlock, Sparkles } from "lucide-react";

interface DecryptionEffectProps {
  isDecrypting: boolean;
  decryptedValue: number | null;
  onComplete?: () => void;
}

export const DecryptionEffect = ({
  isDecrypting,
  decryptedValue,
  onComplete,
}: DecryptionEffectProps) => {
  const [showEffect, setShowEffect] = useState(false);
  const [revealedValue, setRevealedValue] = useState<number | null>(null);

  useEffect(() => {
    if (isDecrypting) {
      setShowEffect(true);
      setRevealedValue(null);
    } else if (decryptedValue !== null && !revealedValue) {
      // Animate value reveal only once
      const timer1 = setTimeout(() => {
        setRevealedValue(decryptedValue);
      }, 500);
      
      const timer2 = setTimeout(() => {
        setShowEffect(false);
        setRevealedValue(null);
        onComplete?.();
      }, 2500);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } else if (!isDecrypting && decryptedValue === null && showEffect) {
      // Reset if decryptedValue becomes null
      setShowEffect(false);
      setRevealedValue(null);
    }
  }, [isDecrypting, decryptedValue, revealedValue, showEffect, onComplete]);

  return (
    <AnimatePresence>
      {showEffect && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        >
          <div className="relative">
            {/* Lock/Unlock Icon Animation */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{
                scale: isDecrypting ? [1, 1.2, 1] : 1,
                rotate: isDecrypting ? -180 : 0,
              }}
              transition={{
                duration: 1,
                repeat: isDecrypting ? Infinity : 0,
                ease: "easeInOut",
              }}
              className="relative z-10"
            >
              {isDecrypting ? (
                <Lock className="w-24 h-24 text-yellow-400" />
              ) : (
                <Unlock className="w-24 h-24 text-green-400" />
              )}
            </motion.div>

            {/* Sparkles Effect */}
            <AnimatePresence>
              {!isDecrypting && revealedValue !== null && (
                <>
                  {[...Array(20)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{
                        x: 0,
                        y: 0,
                        opacity: 1,
                        scale: 0,
                      }}
                      animate={{
                        x: Math.cos((i * 360) / 20) * 200,
                        y: Math.sin((i * 360) / 20) * 200,
                        opacity: 0,
                        scale: [0, 1, 0],
                      }}
                      transition={{
                        duration: 1.5,
                        delay: i * 0.05,
                        ease: "easeOut",
                      }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                    </motion.div>
                  ))}
                </>
              )}
            </AnimatePresence>

            {/* Decrypted Value Display */}
            <AnimatePresence>
              {revealedValue !== null && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.2, 1] }}
                    transition={{ delay: 0.3, type: "spring" }}
                    className="text-8xl font-bold text-white drop-shadow-2xl"
                  >
                    {revealedValue}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Decrypting Text */}
            {isDecrypting && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-32 left-1/2 -translate-x-1/2"
              >
                <motion.p
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-xl font-semibold text-white"
                >
                  Decrypting...
                </motion.p>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};


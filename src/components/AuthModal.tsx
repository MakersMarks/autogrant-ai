import { AuthScreen } from "./autogrant/AuthScreen";

export function AuthModal({ onClose }: { onSuccess?: () => void; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm overflow-y-auto">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-xs px-3 py-1.5 rounded bg-card border border-border"
        >
          Close
        </button>
      )}
      <AuthScreen />
    </div>
  );
}

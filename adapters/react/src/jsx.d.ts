// Teach JSX about the host primitives. This is a non-DOM renderer, so we declare
// our own intrinsic elements. They are namespaced (`symbiote-*`) to avoid
// colliding with react-dom's `view` / `text` (SVG) intrinsics.
import type { ViewProps, TextProps } from './components';

// Host boundary for primitives whose strict public prop types live with their
// components (ImageProps, ScrollViewProps, TextInputProps). A component spreads
// its already-typed props onto these intrinsics, so the host shape stays loose;
// the user-facing strictness is on the component, not the intrinsic.
interface HostProps {
  style?: unknown;
  children?: import('react').ReactNode;
  [key: string]: unknown;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'symbiote-view': ViewProps;
      'symbiote-text': TextProps;
      'symbiote-image': HostProps;
      'symbiote-scroll-view': HostProps;
      'symbiote-scroll-content': HostProps;
      'symbiote-text-input': HostProps;
      'symbiote-text-input-multiline': HostProps;
      'symbiote-switch': HostProps;
      'symbiote-activity-indicator': HostProps;
      'symbiote-safe-area-view': HostProps;
      'symbiote-modal': HostProps;
      'symbiote-refresh-control': HostProps;
    }
  }
}

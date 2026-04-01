# Design Specifications (UI/UX Pro-Max Light Theme)

## 🎨 Color Palette
| Name | Hex | Usage |
|------|-----|-------|
| Primary | #3B82F6 | Buttons, links, accent (Trust Blue) |
| Primary Dark | #2563EB | Hover states |
| Secondary | #10B981 | Success, positive (Emerald 500) |
| Danger | #EF4444 | Destructive actions (Red 500) |
| Background | #F8FAFC | Main background (Slate 50) |
| Surface | #FFFFFF | Cards, modals (Glassmorphic White) |
| Text | #0F172A | Primary text (Slate 900) |
| Text Muted | #64748B | Secondary text (Slate 500) |
| Border | rgba(0,0,0,0.05) | Subtle borders |

## 📝 Typography
| Element | Font | Size | Weight | Line Height |
|---------|------|------|--------|-------------|
| H1 | Inter, sans-serif | 32px | 700 | 1.2 |
| H2 | Inter, sans-serif | 24px | 600 | 1.3 |
| H3 | Inter, sans-serif | 18px | 600 | 1.4 |
| Body | Inter, sans-serif | 14px | 400 | 1.5 |
| Small | Inter, sans-serif | 12px | 400 | 1.4 |

## 📐 Spacing System
| Name | Value | Usage |
|------|-------|-------|
| xs | 4px | Icon gaps |
| sm | 8px | Tight spacing |
| md | 16px | Default padding |
| lg | 24px | Section gaps |
| xl | 32px | Large sections |

## 🔲 Border Radius (Geometry)
| Name | Value | Usage |
|------|-------|-------|
| sm | 4px | Checkboxes, tooltips |
| md | 8px | Buttons, inputs (Standard inner) |
| xl | 16px | Cards, modals, sidebars (Container) |
| full | 9999px | Pills, avatars |

## 🌫️ Shadows & Glassmorphism
| Name | Value | Usage |
|------|-------|-------|
| sm | 0 1px 2px rgba(0,0,0,0.05) | Buttons, inputs |
| soft | 0 10px 25px -5px rgba(0, 0, 0, 0.05) | Main layout cards |
| float | 0 20px 40px -10px rgba(0,0,0,0.08) | Modals, Dropdowns |
| glass-blur | blur(20px) | rgba(255,255,255,0.7) bg |

## 📱 Breakpoints
| Name | Width | Description |
|------|-------|-------------|
| mobile | < 768px | 1-column stack |
| desktop| >= 768px | 2-column grid |

## ✨ Animations
| Name | Duration | Easing | Usage |
|------|----------|--------|-------|
| fast | 150ms | ease-out | Hovers, small |
| normal | 300ms | ease-in-out | Transitions |

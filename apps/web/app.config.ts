export default defineAppConfig({
  ui: {
    button: {
      slots: {
        base: "rounded-[var(--radius-sm)] font-medium transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.45)]",
        label: "truncate"
      },
      variants: {
        variant: {
          solid: "shadow-[var(--shadow-xs)]",
          outline: "bg-[rgb(var(--surface))] ring-1 ring-inset ring-[rgb(var(--border))]",
          soft: "bg-[rgb(var(--primary)/0.14)] text-[rgb(var(--text))]",
          ghost: "hover:bg-[rgb(var(--surface-2))]"
        }
      }
    },
    card: {
      slots: {
        root: "rounded-[var(--radius-sm)] bg-[rgb(var(--surface))] ring-1 ring-[rgb(var(--border))] shadow-[var(--shadow-xs)]",
        header: "px-4 py-3 border-b border-[rgb(var(--border))]",
        body: "p-4",
        footer: "px-4 py-3 border-t border-[rgb(var(--border))]"
      },
      defaultVariants: {
        variant: "outline"
      }
    },
    input: {
      slots: {
        root: "w-full",
        base: "w-full rounded-[var(--radius-sm)] bg-[rgb(var(--surface))] text-[rgb(var(--text))] ring-1 ring-inset ring-[rgb(var(--border))] placeholder:text-[rgb(var(--muted))] focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.45)]"
      },
      defaultVariants: {
        variant: "outline",
        size: "md"
      }
    },
    textarea: {
      slots: {
        root: "w-full",
        base: "w-full rounded-[var(--radius-sm)] bg-[rgb(var(--surface))] text-[rgb(var(--text))] ring-1 ring-inset ring-[rgb(var(--border))] placeholder:text-[rgb(var(--muted))] focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.45)]"
      },
      defaultVariants: {
        variant: "outline",
        size: "md"
      }
    },
    select: {
      slots: {
        base: "w-full rounded-[var(--radius-sm)] bg-[rgb(var(--surface))] text-[rgb(var(--text))] ring-1 ring-inset ring-[rgb(var(--border))] focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.45)]",
        placeholder: "text-[rgb(var(--muted))]"
      },
      defaultVariants: {
        variant: "outline",
        size: "md"
      }
    },
    selectMenu: {
      slots: {
        base: "w-full rounded-[var(--radius-sm)] bg-[rgb(var(--surface))] text-[rgb(var(--text))] ring-1 ring-inset ring-[rgb(var(--border))] focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.45)]"
      },
      defaultVariants: {
        variant: "outline",
        size: "md"
      }
    }
  }
});

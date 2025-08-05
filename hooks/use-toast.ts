import { toast } from "sonner"

type ToastProps = {
  title?: string
  description?: string
  variant?: "default" | "destructive" | "success" | "warning"
}

export const useToast = () => {
  return {
    toast: ({ title, description, variant = "default" }: ToastProps) => {
      const message = title ? `${title}${description ? `: ${description}` : ''}` : description || ''
      
      switch (variant) {
        case "destructive":
          return toast.error(message)
        case "success":
          return toast.success(message)
        case "warning":
          return toast.warning(message)
        default:
          return toast(message)
      }
    },
  }
}
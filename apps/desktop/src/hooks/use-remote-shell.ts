import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

export function useRemoteShellMachine(): string | null | undefined {
  const [machineId, setMachineId] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const load = (): void => {
      void invoke<{ machineId: string } | null>('get_remote_shell_state').then(
        (state) => {
          if (alive)
            setMachineId(state?.machineId ?? null)
        },
        () => {
          if (alive)
            setMachineId(null)
        },
      )
    }
    load()
    const timer = setInterval(load, 2000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])
  return machineId
}

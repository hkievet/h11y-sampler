// Minimal File System Access API typings (Chrome). Only what Export and Persistence use.
interface FileSystemHandle {
  readonly kind: 'file' | 'directory'
  readonly name: string
  queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}
interface FileSystemDirectoryHandle extends FileSystemHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
}
interface Window {
  showDirectoryPicker(options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }): Promise<FileSystemDirectoryHandle>
}
interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>
}

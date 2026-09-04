declare module "archiver" {
  import type { Readable } from "node:stream"

  interface Archiver extends Readable {
    append(source: any, data: any): this
    file(filepath: string, data: any): this
    directory(dirpath: string, destpath: any): this
    finalize(): Promise<void>
    [key: string]: any
  }

  function archiver(format: string, options?: any): Archiver

  export default archiver
}

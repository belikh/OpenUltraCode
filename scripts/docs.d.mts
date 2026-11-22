export declare const generatorRepository: string
export declare function locateGenerator(
  env?: Readonly<Record<string, string | undefined>>,
  root?: string
): { readonly directory: string; readonly owned: boolean }
export declare function missingParts(directory: string, designDirectory: string): string[]
export declare function runGenerator(args: readonly string[], env?: Readonly<Record<string, string | undefined>>): number

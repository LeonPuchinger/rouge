/**
 * Store state globally that lives throughout the whole execution of the program.
 */
interface Environment {
  source: string;
}

let environment: Environment = {
  source: "",
};

/**
 * Update entries in the environment.
 *
 * @param updateEnvironment Entries to override in the current environment.
 * Existing entries that are not specified here are not overridden.
 */
export function updateEnvironment(updateEnvironment: Partial<Environment>) {
  environment = {
    ...environment,
    ...updateEnvironment,
  };
}

/**
 * A type safe way to access entries in the environment.
 *
 * @param key A key that exists in `Environment`.
 * @returns the value in the environment at the key.
 */
export function accessEnvironment<Key extends keyof (Environment)>(
  key: Key,
): Environment[Key] {
  return environment[key];
}

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
 */
export function updateEnvironment(updateEnvironment: Partial<Environment>) {
  environment = {
    ...environment,
    ...updateEnvironment,
  };
}

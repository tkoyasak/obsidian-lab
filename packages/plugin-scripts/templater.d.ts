import type obsidian from "obsidian";

declare global {
  /**
   * This is the type for the Templater `tp` object to use in your TypeScript scripts.
   *
   * This refers to the following versions.
   *
   * - https://github.com/obsidianmd/obsidian-api v1.11.0
   * - https://github.com/SilentVoid13/Templater v2.20.0
   */
  interface Tp {
    /**
     * This module exposes the app instance. Prefer to use this over the global app instance.
     *
     * This is mostly useful when writing scripts.
     *
     * Refer to the Obsidian developer documentation for more information.
     */
    app: obsidian.App;

    /**
     * This module exposes Templater's running configuration.
     *
     * This is mostly useful when writing scripts requiring some context information.
     */
    config: {
      template_file: obsidian.TFile | undefined;
      target_file: obsidian.TFile;
      run_mode: RunMode;
      active_file?: obsidian.TFile | null;
    };

    /**
     * This module contains every internal function related to dates.
     */
    date: {
      now: (
        format?: string,
        offset?: number | string,
        reference?: string,
        reference_format?: string,
      ) => string;
      tomorrow: (format?: string) => string;
      weekday: (
        format: string,
        weekday: number,
        reference?: string,
        reference_format?: string,
      ) => string;
      yesterday: (format?: string) => string;
    };

    /**
     * This module contains every internal function related to files.
     */
    file: {
      content: Promise<string>;
      create_new: (
        template: obsidian.TFile | string,
        filename: string,
        open_new: boolean,
        folder?: obsidian.TFolder | string,
      ) => Promise<obsidian.TFile | undefined>;
      creation_date: (format?: string) => string;
      cursor: (order?: number) => string;
      cursor_append: (content: string) => void;
      exists: (filepath: string) => Promise<boolean>;
      find_tfile: (filename: string) => obsidian.TFile | null;
      folder: (absolute?: boolean) => string;
      include: (include_link: string | obsidian.TFile) => Promise<string>;
      last_modified_date: (format?: string) => string;
      move: (path: string, file_to_move?: obsidian.TFile) => Promise<string>;
      path: (relative: boolean) => string;
      rename: (new_title: string) => Promise<string>;
      selection: () => string;
      tags: string[] | null;
      title: string;
    };

    /**
     * This modules exposes all the frontmatter variables of a file as variables.
     */
    frontmatter: { [key: string]: unknown };

    /**
     * This module exposes hooks that allow you to execute code when a Templater event occurs.
     */
    hooks: {
      on_all_templates_executed: (callback_function: () => unknown) => void;
    };

    /**
     * This module exposes all the functions and classes from the Obsidian API.
     *
     * This is mostly useful when writing scripts.
     *
     * Refer to the Obsidian API declaration file for more information.
     */
    obsidian: typeof obsidian;

    /**
     * This module contains system related functions.
     */
    system: {
      clipboard: () => Promise<string | null>;
      prompt: (
        prompt_text: string,
        default_value: string,
        throw_on_cancel: boolean,
        multi_line: boolean,
      ) => Promise<string | null>;
      suggester: <T>(
        text_items: string[] | ((item: T) => string),
        items: T[],
        throw_on_cancel: boolean,
        placeholder: string,
        limit?: number,
      ) => Promise<T>;
      multi_suggester: <T>(
        text_items: string[] | ((item: T) => string),
        items: T[],
        throw_on_cancel: boolean,
        title: string,
        limit?: number,
      ) => Promise<T[]>;
    };

    /**
     * You can define your own functions in Templater.
     *
     * Refer to the Templater documentation user functions section for more information.
     */
    user: unknown;

    /**
     * This modules contains every internal function related to the web (making web requests).
     */
    web: {
      daily_quote: () => Promise<string>;
      request: (url: string, path?: string) => Promise<string>;
      random_picture: (size: string, query?: string, include_size?: boolean) => Promise<string>;
    };
  }

  /**
   * The RunMode, representing the way Templater was launched (Create new from template, Append to active file, ...).
   */
  enum RunMode {
    CreateNewFromTemplate = 0,
    AppendActiveFile = 1,
    OverwriteFile = 2,
    OverwriteActiveFile = 3,
    DynamicProcessor = 4,
    StartupTemplate = 5,
  }
}

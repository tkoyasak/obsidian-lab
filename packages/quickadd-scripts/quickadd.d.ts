import type obsidian from "obsidian";

declare global {
  /**
   * This is the type for the QuickAdd user script parameters.
   *
   * This refers to the following versions.
   *
   * - https://github.com/obsidianmd/obsidian-api v1.11.0
   * - https://github.com/chhoumann/quickadd v2.12.0
   */
  interface Qa {
    /**
     * Obsidian app instance - see https://docs.obsidian.md/Reference/TypeScript+API/App
     */
    app: obsidian.App;

    /**
     * The QuickAdd API provides a powerful interface for automating tasks in Obsidian through
     * scripts, macros, and inline scripts. The API offers methods for user interaction, file
     * manipulation, AI integration, and more.
     */
    quickAddApi: {
      /**
       * Opens a one-page modal to collect multiple inputs in one go. Values already present in
       * variables are used and not re-asked. Returned values are also stored into variables.
       */
      requestInputs: (
        inputs: Array<{
          id: string;
          label?: string;
          type: "text" | "textarea" | "dropdown" | "date" | "field-suggest" | "suggester";
          placeholder?: string;
          defaultValue?: string;
          options?: string[];
          dateFormat?: string;
          description?: string;
          suggesterConfig?: {
            allowCustomInput?: boolean;
            caseSensitive?: boolean;
            multiSelect?: boolean;
          };
        }>,
      ) => Promise<Record<string, string>>;

      /**
       * Opens a prompt that asks for text input.
       */
      inputPrompt: (header: string, placeholder?: string, value?: string) => Promise<string>;

      /**
       * wideInputPrompt(header: string, placeholder?: string, value?: string): Promise<string>
       */
      wideInputPrompt: (header: string, placeholder?: string, value?: string) => Promise<string>;

      /**
       * Opens a confirmation dialog with Yes/No buttons.
       */
      yesNoPrompt: (header: string, text?: string) => Promise<boolean>;

      /**
       * Shows an information dialog with an OK button.
       */
      infoDialog: (header: string, text: string[] | string) => Promise<void>;

      /**
       * Opens a selection prompt with searchable options. Can optionally allow custom input not in
       * the predefined list.
       */
      suggester: (
        displayItems: string[] | Function,
        actualItems: any[],
        placeholder?: string,
        allowCustomInput?: boolean,
        options?: { renderItem?: (value: any, el: HTMLElement) => void },
      ) => Promise<any>;

      /**
       * Opens a checkbox prompt allowing multiple selections.
       */
      checkboxPrompt: (items: string[], selectedItems?: string[]) => Promise<string[]>;

      /**
       * Executes another QuickAdd choice programmatically.
       */
      executeChoice: (choiceName: string, variables?: { [key: string]: any }) => Promise<void>;

      /**
       * Utility Module
       */
      utility: {
        /**
         * Gets the current clipboard contents.
         */
        getClipboard: () => Promise<string>;

        /**
         * Sets the clipboard contents.
         */
        setClipboard: (text: string) => Promise<void>;

        /**
         * Gets the currently selected text in the active editor. Returns an empty string if there is
         * no active editor or no selection.
         */
        getSelection: () => string;
      };

      /**
       * Date Module
       */
      date: {
        /**
         * Gets formatted current date/time.
         */
        now: (format?: string, offset?: number) => string;

        /**
         * Shorthand for now(format, 1).
         */
        tomorrow: (format?: string) => string;

        /**
         * Shorthand for now(format, -1).
         */
        yesterday: (format?: string) => string;
      };

      /**
       * AI Module
       */
      ai: {
        /**
         * Sends a prompt to an AI model and returns the response.
         */
        prompt: (
          prompt: string,
          model: string | { name: string },
          settings?: object,
        ) => Promise<object>;

        /**
         * Returns available AI models.
         */
        getModels: () => string[];

        /**
         * Gets the maximum token limit for a model.
         */
        getMaxTokens: (model: string) => number;

        /**
         * Counts tokens in text according to model's tokenization.
         */
        countTokens: (text: string, model: string) => number;

        /**
         * Returns recent in-memory AI request logs (newest first).
         */
        getRequestLogs: (limit?: number) => Array<object>;

        /**
         * Returns the latest AI request log entry, or null if none exist.
         */
        getLastRequestLog: () => object | null;

        /**
         * Returns a specific AI request log entry by id.
         */
        getRequestLogById: (id: string) => object | null;

        /**
         * Clears all in-memory AI request logs.
         */
        clearRequestLogs: () => void;
      };

      /**
       * Field Suggestions Module
       */
      fieldSuggestions: {
        /**
         * Retrieves all unique values for a specific field across your vault.
         */
        getFieldValues: (fieldName: string, options?: object) => Promise<string[]>;

        /**
         * Clears the field suggestions cache for better performance.
         */
        clearCache: (fieldName?: string) => void;
      };
    };

    /**
     * Variables object for sharing data between scripts and templates.
     */
    variables: { [key: string]: unknown };

    /**
     * Obsidian module with all classes and utilities.
     */
    obsidian: typeof obsidian;

    /**
     * Abort macro execution with optional message.
     */
    abort: (message: string) => never;
  }
}

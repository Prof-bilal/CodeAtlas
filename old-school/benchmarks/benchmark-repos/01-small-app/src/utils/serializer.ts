export class Serializer {
  static serialize<T>(data: T): string {
    return JSON.stringify(data);
  }

  static deserialize<T>(json: string): T {
    return JSON.parse(json);
  }

  static serializeWithDates<T>(data: T): string {
    return JSON.stringify(data, (key, value) => {
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
      }
      return value;
    });
  }

  static deserializeWithDates<T>(json: string): T {
    return JSON.parse(json, (key, value) => {
      if (value && typeof value === 'object' && value.__type === 'Date') {
        return new Date(value.value);
      }
      return value;
    });
  }

  static toFormData(data: Record<string, any>): FormData {
    const formData = new FormData();
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        if (value instanceof Blob) {
          formData.append(key, value);
        } else {
          formData.append(key, String(value));
        }
      }
    }
    
    return formData;
  }

  static fromFormData(formData: FormData): Record<string, any> {
    const data: Record<string, any> = {};
    
    formData.forEach((value, key) => {
      data[key] = value;
    });
    
    return data;
  }
}

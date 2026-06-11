namespace ComputerUse.NativeHost
{
        internal sealed class JsonBridge
        {
            private readonly JsonSerializerOptions options = new JsonSerializerOptions();

            public Dictionary<string, object> DeserializeDictionary(string json)
            {
                using (var document = JsonDocument.Parse(json))
                {
                    var value = ConvertElement(document.RootElement) as Dictionary<string, object>;
                    if (value == null)
                    {
                        throw NativeHostException.InvalidRequest("Request payload must be a JSON object.");
                    }

                    return value;
                }
            }

            public string Serialize(object value)
            {
                return JsonSerializer.Serialize(value, options);
            }

            private static object ConvertElement(JsonElement element)
            {
                switch (element.ValueKind)
                {
                    case JsonValueKind.Object:
                        var dictionary = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                        foreach (var property in element.EnumerateObject())
                        {
                            dictionary[property.Name] = ConvertElement(property.Value);
                        }

                        return dictionary;
                    case JsonValueKind.Array:
                        var array = new ArrayList();
                        foreach (var item in element.EnumerateArray())
                        {
                            array.Add(ConvertElement(item));
                        }

                        return array;
                    case JsonValueKind.String:
                        return element.GetString();
                    case JsonValueKind.Number:
                        int intValue;
                        if (element.TryGetInt32(out intValue))
                        {
                            return intValue;
                        }

                        long longValue;
                        if (element.TryGetInt64(out longValue))
                        {
                            return longValue;
                        }

                        return element.GetDouble();
                    case JsonValueKind.True:
                        return true;
                    case JsonValueKind.False:
                        return false;
                    case JsonValueKind.Null:
                    case JsonValueKind.Undefined:
                    default:
                        return null;
                }
            }
        }
}

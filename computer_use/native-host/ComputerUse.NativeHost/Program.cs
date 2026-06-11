namespace ComputerUse.NativeHost
{
    internal static class Program
    {
        private static int Main()
        {
            Console.InputEncoding = Encoding.UTF8;
            Console.OutputEncoding = Encoding.UTF8;

            var serializer = new JsonBridge();

            var host = new NativeHostService();
            try
            {
                string line;
                while ((line = Console.ReadLine()) != null)
                {
                    if (string.IsNullOrWhiteSpace(line))
                    {
                        continue;
                    }

                    Dictionary<string, object> request = null;
                    int requestId = 0;

                    try
                    {
                        request = serializer.DeserializeDictionary(line);
                        if (request == null)
                        {
                            throw NativeHostException.InvalidRequest("Request payload could not be decoded.");
                        }

                        requestId = ReadRequiredInt(request, "id");
                        var method = ReadRequiredString(request, "method");
                        var payload = ReadOptionalDictionary(request, "payload");
                        var result = host.Dispatch(method, payload);

                        WriteResponse(serializer, ResponseEnvelope.Success(requestId, result));
                    }
                    catch (NativeHostException error)
                    {
                        WriteResponse(
                            serializer,
                            ResponseEnvelope.Failure(requestId, error.Message, error.Code, error.Details, error.Guidance)
                        );
                    }
                    catch (Exception error)
                    {
                        WriteResponse(
                            serializer,
                            ResponseEnvelope.Failure(
                                requestId,
                                error.Message,
                                "INTERNAL_ERROR",
                                CreateDetails("type", error.GetType().FullName),
                                null
                            )
                        );
                    }
                }
            }
            finally
            {
                host.Dispose();
            }

            return 0;
        }

        private static void WriteResponse(JsonBridge serializer, ResponseEnvelope response)
        {
            Console.WriteLine(serializer.Serialize(response.ToDictionary()));
        }

        private static int ReadRequiredInt(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value))
            {
                throw NativeHostException.InvalidRequest("Native-host request is missing '" + key + "'.");
            }

            return Convert.ToInt32(value);
        }

        private static string ReadRequiredString(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                throw NativeHostException.InvalidRequest("Native-host request is missing '" + key + "'.");
            }

            var text = value.ToString();
            if (string.IsNullOrWhiteSpace(text))
            {
                throw NativeHostException.InvalidRequest("Native-host request property '" + key + "' is empty.");
            }

            return text;
        }

        private static string ReadRequiredLiteralText(IDictionary<string, object> values, string key)
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                throw NativeHostException.InvalidRequest("Native-host request is missing '" + key + "'.");
            }

            return value.ToString() ?? string.Empty;
        }

        private static Dictionary<string, object> ReadOptionalDictionary(
            IDictionary<string, object> values,
            string key
        )
        {
            object value;
            if (!values.TryGetValue(key, out value) || value == null)
            {
                return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            }

            var dictionary = value as Dictionary<string, object>;
            if (dictionary == null)
            {
                throw NativeHostException.InvalidRequest("Native-host property '" + key + "' must be an object.");
            }

            return dictionary;
        }

        private static Dictionary<string, object> CreateDetails(string key, object value)
        {
            var details = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            details[key] = value;
            return details;
        }
    }
}

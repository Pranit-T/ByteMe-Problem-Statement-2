import pydantic.v1.fields
import langchain_core._api.deprecation

# Suppress the V1 UserWarning
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="langchain_core._api.deprecation")

_original_set_default = pydantic.v1.fields.ModelField._set_default_and_type

def patched_set_default(self, *args, **kwargs):
    try:
        if self.name == "chroma_server_nofile":
            self.type_ = bool
            self.outer_type_ = bool
            self.required = False
            self.default = False
            return
        _original_set_default(self, *args, **kwargs)
    except Exception:
        self.type_ = Any
        self.outer_type_ = Any
        self.required = False
        self.default = None

pydantic.v1.fields.ModelField._set_default_and_type = patched_set_default

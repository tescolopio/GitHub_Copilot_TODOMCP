# Sample Python module for testing

def calculate_fibonacci(n):
    """
    Calculate the nth Fibonacci number
    TODO: add input validation for negative numbers
    """
    if n <= 1:
        return n
    return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)

def is_palindrome(s):
    """
    Check if a string is a palindrome
    TODO: fix formatting and make case-insensitive
    """
    return s==s[::-1]

class DataProcessor:
    def __init__(self):
        # TODO: add comment about initialization
        self.data = []
    
    def add_item(self, item):
        # TODO: update documentation with type hints
        self.data.append(item)
    
    def process_data(self):
        # TODO: rename process_data to transform_data
        return [item.upper() if isinstance(item, str) else item for item in self.data]
    
    def get_stats(self):
        # TODO: implement proper statistics calculation
        return {
            'count': len(self.data),
            'types': list(set(type(item).__name__ for item in self.data))
        }
